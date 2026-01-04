# KMS Module Variables

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

variable "enable_secrets_key" {
  type        = bool
  description = "Create KMS key for Secrets Manager encryption"
  default     = true
}

variable "enable_s3_key" {
  type        = bool
  description = "Create KMS key for S3 bucket encryption"
  default     = true
}

variable "enable_dynamodb_key" {
  type        = bool
  description = "Create KMS key for DynamoDB encryption (optional, can use AWS-managed)"
  default     = false
}

variable "deletion_window_in_days" {
  type        = number
  description = "Duration in days after which the key is deleted after destruction"
  default     = 30
}

variable "enable_key_rotation" {
  type        = bool
  description = "Enable automatic key rotation"
  default     = true
}

variable "lambda_role_arns" {
  type        = list(string)
  description = "List of Lambda execution role ARNs that need access to KMS keys"
  default     = []
}

variable "admin_role_arns" {
  type        = list(string)
  description = "List of IAM role ARNs for key administration"
  default     = []
}

variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
