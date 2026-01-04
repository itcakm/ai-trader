# ElastiCache Redis Module Variables

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

#------------------------------------------------------------------------------
# Network Configuration
#------------------------------------------------------------------------------
variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for Redis deployment"
}

variable "redis_security_group_id" {
  type        = string
  description = "Security group ID for Redis cluster"
}

#------------------------------------------------------------------------------
# Redis Cluster Configuration
#------------------------------------------------------------------------------
variable "redis_node_type" {
  type        = string
  description = "ElastiCache Redis node type"
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  type        = number
  description = "Number of cache nodes in Redis cluster"
  default     = 1
  validation {
    condition     = var.redis_num_cache_nodes >= 1 && var.redis_num_cache_nodes <= 6
    error_message = "Number of cache nodes must be between 1 and 6."
  }
}

variable "redis_engine_version" {
  type        = string
  description = "Redis engine version"
  default     = "7.1"
}

variable "redis_port" {
  type        = number
  description = "Redis port number"
  default     = 6379
}

variable "redis_parameter_group_family" {
  type        = string
  description = "Redis parameter group family"
  default     = "redis7"
}


#------------------------------------------------------------------------------
# High Availability Configuration
#------------------------------------------------------------------------------
variable "redis_multi_az" {
  type        = bool
  description = "Enable Multi-AZ deployment with automatic failover"
  default     = false
}

#------------------------------------------------------------------------------
# Security Configuration
#------------------------------------------------------------------------------
variable "redis_auth_token" {
  type        = string
  description = "Auth token for Redis authentication (transit encryption must be enabled)"
  sensitive   = true
  default     = null
}

#------------------------------------------------------------------------------
# Backup Configuration
#------------------------------------------------------------------------------
variable "redis_snapshot_retention_days" {
  type        = number
  description = "Number of days to retain automatic snapshots (0 to disable)"
  default     = 0
  validation {
    condition     = var.redis_snapshot_retention_days >= 0 && var.redis_snapshot_retention_days <= 35
    error_message = "Snapshot retention must be between 0 and 35 days."
  }
}

variable "redis_snapshot_window" {
  type        = string
  description = "Daily time range for automatic snapshots (UTC)"
  default     = "03:00-05:00"
}

#------------------------------------------------------------------------------
# Maintenance Configuration
#------------------------------------------------------------------------------
variable "redis_maintenance_window" {
  type        = string
  description = "Weekly maintenance window (UTC)"
  default     = "sun:05:00-sun:07:00"
}

#------------------------------------------------------------------------------
# Notification Configuration
#------------------------------------------------------------------------------
variable "sns_topic_arn" {
  type        = string
  description = "SNS topic ARN for Redis notifications"
  default     = null
}

#------------------------------------------------------------------------------
# Tags
#------------------------------------------------------------------------------
variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
