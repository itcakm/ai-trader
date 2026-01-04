# EventBridge Module - Variables
# Defines input variables for EventBridge scheduled rules and event bus

variable "environment" {
  type        = string
  description = "Environment name (test/production)"

  validation {
    condition     = contains(["test", "production"], var.environment)
    error_message = "Environment must be either 'test' or 'production'."
  }
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

variable "enable_scheduled_rules" {
  type        = bool
  description = "Enable scheduled EventBridge rules"
  default     = true
}

#------------------------------------------------------------------------------
# Lambda Function Configuration
#------------------------------------------------------------------------------
variable "lambda_function_arns" {
  type        = map(string)
  description = "Map of Lambda function names to their ARNs"
}

variable "lambda_function_names" {
  type        = map(string)
  description = "Map of Lambda function names to their actual function names"
}

#------------------------------------------------------------------------------
# SNS Configuration for Risk Events
#------------------------------------------------------------------------------
variable "sns_topic_arns" {
  type        = map(string)
  description = "Map of SNS topic names to their ARNs for notifications"
  default     = {}
}

#------------------------------------------------------------------------------
# Dead Letter Queue Configuration
#------------------------------------------------------------------------------
variable "dlq_message_retention_seconds" {
  type        = number
  description = "Message retention period for DLQ in seconds"
  default     = 1209600 # 14 days
}

variable "dlq_max_receive_count" {
  type        = number
  description = "Maximum number of receives before message goes to DLQ"
  default     = 3
}

#------------------------------------------------------------------------------
# Risk Event Configuration
#------------------------------------------------------------------------------
variable "enable_risk_event_rules" {
  type        = bool
  description = "Enable risk event notification rules"
  default     = true
}

variable "risk_event_types" {
  type        = list(string)
  description = "List of risk event types to create rules for"
  default = [
    "POSITION_LIMIT_BREACH",
    "DRAWDOWN_THRESHOLD_EXCEEDED",
    "CIRCUIT_BREAKER_TRIGGERED",
    "KILL_SWITCH_ACTIVATED",
    "TRADE_REJECTED"
  ]
}

#------------------------------------------------------------------------------
# Tags
#------------------------------------------------------------------------------
variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
