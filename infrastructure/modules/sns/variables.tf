# SNS Module Variables

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
# KMS Configuration
#------------------------------------------------------------------------------
variable "kms_key_arn" {
  type        = string
  description = "ARN of the KMS key for encrypting SNS topics. If not provided, a new key will be created."
  default     = ""
}

variable "kms_deletion_window_in_days" {
  type        = number
  description = "Number of days before KMS key deletion (if creating new key)"
  default     = 30
}

#------------------------------------------------------------------------------
# Access Control
#------------------------------------------------------------------------------
variable "lambda_role_arns" {
  type        = list(string)
  description = "List of Lambda execution role ARNs that can publish to SNS topics"
  default     = []
}

variable "step_functions_role_arn" {
  type        = string
  description = "ARN of the Step Functions role that can publish to SNS topics"
  default     = ""
}

#------------------------------------------------------------------------------
# Email Subscription Endpoints
#------------------------------------------------------------------------------
variable "critical_alerts_email_endpoints" {
  type        = list(string)
  description = "List of email addresses to subscribe to critical alerts topic"
  default     = []
}

variable "risk_events_email_endpoints" {
  type        = list(string)
  description = "List of email addresses to subscribe to risk events topic"
  default     = []
}

variable "system_health_email_endpoints" {
  type        = list(string)
  description = "List of email addresses to subscribe to system health topic"
  default     = []
}

variable "audit_notifications_email_endpoints" {
  type        = list(string)
  description = "List of email addresses to subscribe to audit notifications topic"
  default     = []
}

#------------------------------------------------------------------------------
# SMS Subscription Configuration (Production Only)
#------------------------------------------------------------------------------
variable "enable_sms_notifications" {
  type        = bool
  description = "Enable SMS notifications for critical alerts (typically production only)"
  default     = false
}

variable "critical_alerts_sms_endpoints" {
  type        = list(string)
  description = "List of phone numbers (E.164 format) to subscribe to critical alerts topic"
  default     = []
}

#------------------------------------------------------------------------------
# Tags
#------------------------------------------------------------------------------
variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
