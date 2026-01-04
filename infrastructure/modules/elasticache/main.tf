# ElastiCache Redis Module - Main Configuration
# Creates Redis cluster with environment-appropriate configuration

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })
}

#------------------------------------------------------------------------------
# ElastiCache Subnet Group
#------------------------------------------------------------------------------
resource "aws_elasticache_subnet_group" "redis" {
  name        = "${local.name_prefix}-redis-subnet-group"
  description = "Subnet group for Redis cluster in private subnets"
  subnet_ids  = var.private_subnet_ids

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-subnet-group"
  })
}

#------------------------------------------------------------------------------
# ElastiCache Parameter Group
#------------------------------------------------------------------------------
resource "aws_elasticache_parameter_group" "redis" {
  name        = "${local.name_prefix}-redis-params"
  family      = var.redis_parameter_group_family
  description = "Custom parameter group for Redis cluster"

  # Enable cluster mode disabled for simpler setup
  parameter {
    name  = "cluster-enabled"
    value = "no"
  }

  # Set maxmemory policy for cache eviction
  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-params"
  })
}


#------------------------------------------------------------------------------
# ElastiCache Replication Group (Redis Cluster)
#------------------------------------------------------------------------------
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "Redis cluster for ${var.environment} environment"

  # Engine configuration
  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  port                 = var.redis_port
  parameter_group_name = aws_elasticache_parameter_group.redis.name

  # Cluster configuration
  num_cache_clusters = var.redis_num_cache_nodes

  # Network configuration
  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [var.redis_security_group_id]

  # High availability configuration
  automatic_failover_enabled = var.redis_multi_az && var.redis_num_cache_nodes > 1
  multi_az_enabled           = var.redis_multi_az && var.redis_num_cache_nodes > 1

  # Encryption configuration (Requirements 8.3)
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token

  # Backup configuration (Requirements 8.7)
  snapshot_retention_limit = var.redis_snapshot_retention_days
  snapshot_window          = var.redis_snapshot_window

  # Maintenance configuration
  maintenance_window         = var.redis_maintenance_window
  auto_minor_version_upgrade = true

  # Notification configuration
  notification_topic_arn = var.sns_topic_arn

  # Apply changes immediately in test, during maintenance window in production
  apply_immediately = var.environment == "test"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis"
  })

  lifecycle {
    ignore_changes = [
      # Ignore changes to auth_token after creation
      auth_token
    ]
  }
}
