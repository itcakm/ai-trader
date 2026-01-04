# CloudWatch Module Variables

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
# Lambda Configuration
#------------------------------------------------------------------------------
variable "lambda_function_names" {
  type        = map(string)
  description = "Map of Lambda function names (key = logical name, value = full function name)"
  default     = {}
}

#------------------------------------------------------------------------------
# API Gateway Configuration
#------------------------------------------------------------------------------
variable "api_gateway_name" {
  type        = string
  description = "Name of the API Gateway REST API"
  default     = ""
}

variable "create_api_gateway_log_group" {
  type        = bool
  description = "Whether to create a log group for API Gateway"
  default     = false
}

#------------------------------------------------------------------------------
# DynamoDB Configuration
#------------------------------------------------------------------------------
variable "dynamodb_table_names" {
  type        = list(string)
  description = "List of DynamoDB table names to monitor"
  default     = []
}

#------------------------------------------------------------------------------
# Redis Configuration
#------------------------------------------------------------------------------
variable "redis_cluster_id" {
  type        = string
  description = "ElastiCache Redis cluster ID"
  default     = ""
}

#------------------------------------------------------------------------------
# Log Retention Configuration
# Requirements: 14.6
#------------------------------------------------------------------------------
variable "log_retention_days" {
  type        = number
  description = "Number of days to retain CloudWatch logs (30 for test, 90 for production)"
  default     = 30
}

#------------------------------------------------------------------------------
# SNS Topic ARNs for Alarm Actions
# Requirements: 14.8
#------------------------------------------------------------------------------
variable "critical_alerts_sns_topic_arn" {
  type        = string
  description = "ARN of the SNS topic for critical alerts"
  default     = ""
}

variable "system_health_sns_topic_arn" {
  type        = string
  description = "ARN of the SNS topic for system health notifications"
  default     = ""
}

variable "risk_events_sns_topic_arn" {
  type        = string
  description = "ARN of the SNS topic for risk event notifications"
  default     = ""
}

#------------------------------------------------------------------------------
# Alarm Configuration - Lambda
# Requirements: 14.2
#------------------------------------------------------------------------------
variable "lambda_error_threshold_percent" {
  type        = number
  description = "Lambda error rate threshold percentage (default: 5%)"
  default     = 5
}

variable "lambda_error_evaluation_periods" {
  type        = number
  description = "Number of evaluation periods for Lambda error alarms"
  default     = 2
}

#------------------------------------------------------------------------------
# Alarm Configuration - API Gateway
# Requirements: 14.3
#------------------------------------------------------------------------------
variable "api_gateway_5xx_threshold_percent" {
  type        = number
  description = "API Gateway 5xx error rate threshold percentage (default: 1%)"
  default     = 1
}

variable "api_gateway_error_evaluation_periods" {
  type        = number
  description = "Number of evaluation periods for API Gateway error alarms"
  default     = 2
}

#------------------------------------------------------------------------------
# Alarm Configuration - DynamoDB
# Requirements: 14.4
#------------------------------------------------------------------------------
variable "dynamodb_throttle_threshold" {
  type        = number
  description = "DynamoDB throttling threshold (number of throttled requests)"
  default     = 1
}

variable "dynamodb_throttle_evaluation_periods" {
  type        = number
  description = "Number of evaluation periods for DynamoDB throttling alarms"
  default     = 2
}

#------------------------------------------------------------------------------
# Alarm Configuration - Redis
# Requirements: 14.5
#------------------------------------------------------------------------------
variable "redis_memory_threshold_percent" {
  type        = number
  description = "Redis memory utilization threshold percentage (default: 80%)"
  default     = 80
}

variable "redis_memory_evaluation_periods" {
  type        = number
  description = "Number of evaluation periods for Redis memory alarms"
  default     = 2
}

variable "redis_cpu_threshold_percent" {
  type        = number
  description = "Redis CPU utilization threshold percentage (default: 80%)"
  default     = 80
}

variable "redis_cpu_evaluation_periods" {
  type        = number
  description = "Number of evaluation periods for Redis CPU alarms"
  default     = 2
}

#------------------------------------------------------------------------------
# General Alarm Configuration
#------------------------------------------------------------------------------
variable "alarm_period_seconds" {
  type        = number
  description = "Period in seconds for alarm evaluation"
  default     = 300
}

#------------------------------------------------------------------------------
# Tags
#------------------------------------------------------------------------------
variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
