# S3 Module Variables

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

variable "audit_log_retention_days" {
  type        = number
  description = "Number of days to retain audit logs (90 for test, 2555 for production - 7 years)"
  default     = 90
}

variable "enable_access_logging" {
  type        = bool
  description = "Enable access logging for audit-logs bucket"
  default     = true
}

variable "cloudfront_oai_arn" {
  type        = string
  description = "CloudFront Origin Access Identity ARN for frontend-assets bucket policy"
  default     = null
}

variable "cors_allowed_origins" {
  type        = list(string)
  description = "List of allowed origins for CORS on frontend-assets bucket"
  default     = ["*"]
}

variable "enable_lambda_deployments_lifecycle" {
  type        = bool
  description = "Enable lifecycle policy for lambda-deployments bucket"
  default     = true
}

variable "lambda_deployments_retention_days" {
  type        = number
  description = "Number of days to retain old lambda deployment versions"
  default     = 30
}

variable "enable_model_outputs_lifecycle" {
  type        = bool
  description = "Enable lifecycle policy for model-outputs bucket"
  default     = false
}

variable "model_outputs_retention_days" {
  type        = number
  description = "Number of days to retain old model output versions"
  default     = 90
}

variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
