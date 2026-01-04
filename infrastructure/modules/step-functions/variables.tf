# Step Functions Module Variables
# Defines all input variables for Step Functions state machine configuration

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
}

variable "step_functions_role_arn" {
  type        = string
  description = "IAM role ARN for Step Functions execution"
}

variable "lambda_function_arns" {
  type        = map(string)
  description = "Map of Lambda function ARNs by function name"
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention in days"
  default     = 30
}

variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
