# Timestream Module Variables

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
# Retention Settings
# Requirement 4.3: Memory store retention (24h test, 7d production)
# Requirement 4.4: Magnetic store retention (30d test, 365d production)
#------------------------------------------------------------------------------
variable "memory_store_retention_hours" {
  type        = number
  description = "Memory store retention period in hours (24 for test, 168 for production)"
  default     = 24

  validation {
    condition     = var.memory_store_retention_hours >= 1 && var.memory_store_retention_hours <= 8766
    error_message = "memory_store_retention_hours must be between 1 and 8766 (1 year)"
  }
}

variable "magnetic_store_retention_days" {
  type        = number
  description = "Magnetic store retention period in days (30 for test, 365 for production)"
  default     = 30

  validation {
    condition     = var.magnetic_store_retention_days >= 1 && var.magnetic_store_retention_days <= 73000
    error_message = "magnetic_store_retention_days must be between 1 and 73000 (200 years)"
  }
}

#------------------------------------------------------------------------------
# Magnetic Store Write Settings
#------------------------------------------------------------------------------
variable "enable_magnetic_store_writes" {
  type        = bool
  description = "Enable magnetic store writes for late-arriving data"
  default     = true
}

variable "rejected_data_s3_bucket_name" {
  type        = string
  description = "S3 bucket name for storing rejected records (optional)"
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


#------------------------------------------------------------------------------
# IAM Policy Settings
# Requirement 4.6: Create appropriate IAM policies for Lambda access
#------------------------------------------------------------------------------
variable "create_iam_policies" {
  type        = bool
  description = "Whether to create IAM policies for Timestream access"
  default     = true
}
