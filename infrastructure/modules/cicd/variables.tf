# CI/CD Module Variables

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
}

#------------------------------------------------------------------------------
# GitHub Actions Configuration
#------------------------------------------------------------------------------
variable "create_github_oidc_provider" {
  type        = bool
  description = "Whether to create the GitHub OIDC provider (set to false if already exists)"
  default     = true
}

variable "github_oidc_provider_arn" {
  type        = string
  description = "ARN of existing GitHub OIDC provider (required if create_github_oidc_provider is false)"
  default     = null
}

variable "github_repositories" {
  type        = list(string)
  description = "List of GitHub repository patterns allowed to assume the role (e.g., 'repo:org/repo:*')"
  default     = []
}

#------------------------------------------------------------------------------
# CodePipeline Configuration
#------------------------------------------------------------------------------
variable "create_codepipeline_role" {
  type        = bool
  description = "Whether to create the CodePipeline IAM role"
  default     = false
}

#------------------------------------------------------------------------------
# ECR Configuration
#------------------------------------------------------------------------------
variable "create_ecr_repository" {
  type        = bool
  description = "Whether to create an ECR repository for container images"
  default     = false
}

variable "ecr_image_retention_count" {
  type        = number
  description = "Number of images to retain in ECR repository"
  default     = 30
}

#------------------------------------------------------------------------------
# S3 Bucket ARNs
#------------------------------------------------------------------------------
variable "lambda_deployment_bucket_arn" {
  type        = string
  description = "ARN of the S3 bucket for Lambda deployment packages"
}

variable "frontend_assets_bucket_arn" {
  type        = string
  description = "ARN of the S3 bucket for frontend assets"
}

#------------------------------------------------------------------------------
# Lambda Configuration
#------------------------------------------------------------------------------
variable "lambda_function_arns" {
  type        = list(string)
  description = "List of Lambda function ARNs that can be updated by CI/CD"
  default     = []
}

#------------------------------------------------------------------------------
# CloudFront Configuration
#------------------------------------------------------------------------------
variable "cloudfront_distribution_arn" {
  type        = string
  description = "ARN of the CloudFront distribution for cache invalidation"
  default     = null
}

#------------------------------------------------------------------------------
# CloudWatch Logs Configuration
#------------------------------------------------------------------------------
variable "log_retention_days" {
  type        = number
  description = "Number of days to retain CI/CD logs"
  default     = 30
}

#------------------------------------------------------------------------------
# Tags
#------------------------------------------------------------------------------
variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to resources"
  default     = {}
}
