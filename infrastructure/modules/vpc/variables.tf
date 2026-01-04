# VPC Module Variables

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC"
}

variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones"
}

variable "enable_nat_gateway" {
  type        = bool
  description = "Enable NAT Gateway"
  default     = true
}

variable "single_nat_gateway" {
  type        = bool
  description = "Use single NAT Gateway (for test environment cost optimization)"
  default     = false
}

variable "enable_vpn_gateway" {
  type        = bool
  description = "Enable VPN Gateway"
  default     = false
}

variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
