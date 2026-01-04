# ACM CloudFront Certificate Variables
# Variables for CloudFront SSL/TLS certificates in us-east-1

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

variable "domain_name" {
  type        = string
  description = "Primary domain name for CloudFront certificate"
}

variable "subject_alternative_names" {
  type        = list(string)
  description = "Additional domain names for the CloudFront certificate"
  default     = []
}

variable "route53_zone_id" {
  type        = string
  description = "Route 53 hosted zone ID for DNS validation"
  default     = ""
}

variable "create_route53_records" {
  type        = bool
  description = "Whether to create Route 53 DNS validation records"
  default     = true
}

variable "wait_for_validation" {
  type        = bool
  description = "Whether to wait for certificate validation to complete"
  default     = true
}

variable "validation_timeout" {
  type        = string
  description = "Timeout for certificate validation"
  default     = "45m"
}

variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
