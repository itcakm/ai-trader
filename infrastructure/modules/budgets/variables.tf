# AWS Budgets Module Variables
# Requirements: 23.1, 23.2, 23.3, 23.4

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
# Budget Configuration
#------------------------------------------------------------------------------
variable "monthly_budget_amount" {
  type        = number
  description = "Monthly budget amount in USD"
  default     = 500
}

variable "budget_currency" {
  type        = string
  description = "Currency for budget (USD, EUR, etc.)"
  default     = "USD"
}

variable "budget_time_unit" {
  type        = string
  description = "Time unit for budget (MONTHLY, QUARTERLY, ANNUALLY)"
  default     = "MONTHLY"
}

#------------------------------------------------------------------------------
# Alert Thresholds
#------------------------------------------------------------------------------
variable "alert_threshold_50" {
  type        = number
  description = "First alert threshold percentage"
  default     = 50
}

variable "alert_threshold_80" {
  type        = number
  description = "Second alert threshold percentage"
  default     = 80
}

variable "alert_threshold_100" {
  type        = number
  description = "Third alert threshold percentage"
  default     = 100
}

#------------------------------------------------------------------------------
# Notification Configuration
#------------------------------------------------------------------------------
variable "sns_topic_arn" {
  type        = string
  description = "SNS topic ARN for budget notifications"
  default     = null
}

variable "notification_email_addresses" {
  type        = list(string)
  description = "List of email addresses for budget notifications"
  default     = []
}

#------------------------------------------------------------------------------
# Cost Allocation Tags
#------------------------------------------------------------------------------
variable "enable_cost_allocation_tags" {
  type        = bool
  description = "Enable cost allocation tags for Cost Explorer"
  default     = true
}

variable "cost_allocation_tags" {
  type        = list(string)
  description = "List of tag keys to enable for cost allocation"
  default     = ["Environment", "Project", "Owner", "CostCenter"]
}

#------------------------------------------------------------------------------
# Service-Specific Budgets (Optional)
#------------------------------------------------------------------------------
variable "create_service_budgets" {
  type        = bool
  description = "Create separate budgets for major AWS services"
  default     = false
}

variable "lambda_budget_amount" {
  type        = number
  description = "Monthly budget for Lambda service"
  default     = 100
}

variable "dynamodb_budget_amount" {
  type        = number
  description = "Monthly budget for DynamoDB service"
  default     = 100
}

variable "api_gateway_budget_amount" {
  type        = number
  description = "Monthly budget for API Gateway service"
  default     = 50
}

#------------------------------------------------------------------------------
# Tags
#------------------------------------------------------------------------------
variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
