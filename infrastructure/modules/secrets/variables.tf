# Secrets Manager Module Variables

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

variable "kms_key_arn" {
  type        = string
  description = "ARN of the KMS key for encrypting secrets"
}

variable "recovery_window_in_days" {
  type        = number
  description = "Number of days before a secret can be deleted (0 for immediate deletion in test)"
  default     = 30
}

variable "lambda_role_arns" {
  type        = list(string)
  description = "List of Lambda execution role ARNs that need access to secrets"
  default     = []
}

variable "enable_rotation" {
  type        = bool
  description = "Enable automatic rotation for applicable secrets"
  default     = false
}

variable "rotation_lambda_arn" {
  type        = string
  description = "ARN of the Lambda function for secret rotation"
  default     = ""
}

variable "rotation_days" {
  type        = number
  description = "Number of days between automatic secret rotations"
  default     = 30
}

variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
