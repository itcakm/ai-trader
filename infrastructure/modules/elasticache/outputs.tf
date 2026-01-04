# ElastiCache Redis Module Outputs

output "redis_replication_group_id" {
  description = "The ID of the Redis replication group"
  value       = aws_elasticache_replication_group.redis.id
}

output "redis_replication_group_arn" {
  description = "The ARN of the Redis replication group"
  value       = aws_elasticache_replication_group.redis.arn
}

output "redis_primary_endpoint_address" {
  description = "The address of the primary endpoint for the Redis replication group"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_reader_endpoint_address" {
  description = "The address of the reader endpoint for the Redis replication group"
  value       = aws_elasticache_replication_group.redis.reader_endpoint_address
}

output "redis_port" {
  description = "The port number for Redis connections"
  value       = var.redis_port
}

output "redis_connection_string" {
  description = "Redis connection string (without auth token)"
  value       = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:${var.redis_port}"
}

output "redis_subnet_group_name" {
  description = "The name of the Redis subnet group"
  value       = aws_elasticache_subnet_group.redis.name
}

output "redis_parameter_group_name" {
  description = "The name of the Redis parameter group"
  value       = aws_elasticache_parameter_group.redis.name
}

output "redis_engine_version" {
  description = "The Redis engine version"
  value       = aws_elasticache_replication_group.redis.engine_version_actual
}

output "redis_cluster_enabled" {
  description = "Whether cluster mode is enabled"
  value       = aws_elasticache_replication_group.redis.cluster_enabled
}

output "redis_multi_az_enabled" {
  description = "Whether Multi-AZ is enabled"
  value       = aws_elasticache_replication_group.redis.multi_az_enabled
}

output "redis_automatic_failover_enabled" {
  description = "Whether automatic failover is enabled"
  value       = aws_elasticache_replication_group.redis.automatic_failover_enabled
}

output "redis_at_rest_encryption_enabled" {
  description = "Whether at-rest encryption is enabled"
  value       = aws_elasticache_replication_group.redis.at_rest_encryption_enabled
}

output "redis_transit_encryption_enabled" {
  description = "Whether transit encryption is enabled"
  value       = aws_elasticache_replication_group.redis.transit_encryption_enabled
}
