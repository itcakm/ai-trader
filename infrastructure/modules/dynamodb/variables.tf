# DynamoDB Module Variables

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

variable "billing_mode" {
  type        = string
  description = "DynamoDB billing mode (PAY_PER_REQUEST or PROVISIONED)"
  default     = "PAY_PER_REQUEST"

  validation {
    condition     = contains(["PAY_PER_REQUEST", "PROVISIONED"], var.billing_mode)
    error_message = "billing_mode must be either PAY_PER_REQUEST or PROVISIONED"
  }
}

variable "enable_point_in_time_recovery" {
  type        = bool
  description = "Enable point-in-time recovery for all tables"
  default     = true
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key ARN for server-side encryption (null for AWS-managed keys)"
  default     = null
}

#------------------------------------------------------------------------------
# Provisioned Capacity Settings (only used when billing_mode = PROVISIONED)
#------------------------------------------------------------------------------
variable "default_read_capacity" {
  type        = number
  description = "Default read capacity units for tables (PROVISIONED mode only)"
  default     = 5
}

variable "default_write_capacity" {
  type        = number
  description = "Default write capacity units for tables (PROVISIONED mode only)"
  default     = 5
}

variable "gsi_read_capacity" {
  type        = number
  description = "Read capacity units for GSIs (PROVISIONED mode only)"
  default     = 5
}

variable "gsi_write_capacity" {
  type        = number
  description = "Write capacity units for GSIs (PROVISIONED mode only)"
  default     = 5
}

#------------------------------------------------------------------------------
# Auto-scaling Settings (only used when enable_autoscaling = true)
#------------------------------------------------------------------------------
variable "enable_autoscaling" {
  type        = bool
  description = "Enable auto-scaling for provisioned capacity"
  default     = false
}

variable "autoscaling_min_read_capacity" {
  type        = number
  description = "Minimum read capacity for auto-scaling"
  default     = 5
}

variable "autoscaling_max_read_capacity" {
  type        = number
  description = "Maximum read capacity for auto-scaling"
  default     = 100
}

variable "autoscaling_min_write_capacity" {
  type        = number
  description = "Minimum write capacity for auto-scaling"
  default     = 5
}

variable "autoscaling_max_write_capacity" {
  type        = number
  description = "Maximum write capacity for auto-scaling"
  default     = 100
}

variable "autoscaling_target_utilization" {
  type        = number
  description = "Target utilization percentage for auto-scaling"
  default     = 70
}

#------------------------------------------------------------------------------
# High-throughput table settings
#------------------------------------------------------------------------------
variable "high_throughput_tables" {
  type        = list(string)
  description = "List of table names that require higher capacity"
  default = [
    "risk-events",
    "trade-lifecycle",
    "circuit-breaker-events"
  ]
}

variable "high_throughput_read_capacity" {
  type        = number
  description = "Read capacity for high-throughput tables"
  default     = 25
}

variable "high_throughput_write_capacity" {
  type        = number
  description = "Write capacity for high-throughput tables"
  default     = 25
}

variable "high_throughput_max_read_capacity" {
  type        = number
  description = "Maximum read capacity for high-throughput tables auto-scaling"
  default     = 500
}

variable "high_throughput_max_write_capacity" {
  type        = number
  description = "Maximum write capacity for high-throughput tables auto-scaling"
  default     = 500
}

#------------------------------------------------------------------------------
# Tags
#------------------------------------------------------------------------------
variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
