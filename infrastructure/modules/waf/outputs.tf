# WAF Module Outputs
# Exposes WAF Web ACL ARNs and IDs for use by other modules
# Requirements: 15.1, 15.2, 7.10

#------------------------------------------------------------------------------
# API Gateway WAF Outputs
#------------------------------------------------------------------------------
output "api_gateway_web_acl_arn" {
  description = "ARN of the WAF Web ACL for API Gateway"
  value       = aws_wafv2_web_acl.api_gateway.arn
}

output "api_gateway_web_acl_id" {
  description = "ID of the WAF Web ACL for API Gateway"
  value       = aws_wafv2_web_acl.api_gateway.id
}

output "api_gateway_web_acl_capacity" {
  description = "Capacity units used by the API Gateway Web ACL"
  value       = aws_wafv2_web_acl.api_gateway.capacity
}

#------------------------------------------------------------------------------
# CloudFront WAF Outputs
#------------------------------------------------------------------------------
output "cloudfront_web_acl_arn" {
  description = "ARN of the WAF Web ACL for CloudFront"
  value       = var.create_cloudfront_waf ? aws_wafv2_web_acl.cloudfront[0].arn : null
}

output "cloudfront_web_acl_id" {
  description = "ID of the WAF Web ACL for CloudFront"
  value       = var.create_cloudfront_waf ? aws_wafv2_web_acl.cloudfront[0].id : null
}

#------------------------------------------------------------------------------
# IP Set Outputs
#------------------------------------------------------------------------------
output "blocked_ip_set_arn" {
  description = "ARN of the blocked IP set"
  value       = length(var.blocked_ip_addresses) > 0 ? aws_wafv2_ip_set.blocked_ips[0].arn : null
}

output "allowed_ip_set_arn" {
  description = "ARN of the allowed IP set"
  value       = length(var.allowed_ip_addresses) > 0 ? aws_wafv2_ip_set.allowed_ips[0].arn : null
}

#------------------------------------------------------------------------------
# Association Outputs
#------------------------------------------------------------------------------
output "api_gateway_association_id" {
  description = "ID of the WAF association with API Gateway"
  value       = var.api_gateway_stage_arn != "" ? aws_wafv2_web_acl_association.api_gateway[0].id : null
}

#------------------------------------------------------------------------------
# WAF Log Bucket Outputs
#------------------------------------------------------------------------------
output "waf_logs_bucket_id" {
  description = "ID of the WAF logs S3 bucket"
  value       = var.enable_logging && var.create_waf_log_bucket ? aws_s3_bucket.waf_logs[0].id : null
}

output "waf_logs_bucket_arn" {
  description = "ARN of the WAF logs S3 bucket"
  value       = var.enable_logging && var.create_waf_log_bucket ? aws_s3_bucket.waf_logs[0].arn : null
}

output "cloudfront_waf_logs_bucket_id" {
  description = "ID of the CloudFront WAF logs S3 bucket"
  value       = var.create_cloudfront_waf && var.enable_logging && var.create_waf_log_bucket ? aws_s3_bucket.cloudfront_waf_logs[0].id : null
}

output "cloudfront_waf_logs_bucket_arn" {
  description = "ARN of the CloudFront WAF logs S3 bucket"
  value       = var.create_cloudfront_waf && var.enable_logging && var.create_waf_log_bucket ? aws_s3_bucket.cloudfront_waf_logs[0].arn : null
}

#------------------------------------------------------------------------------
# Auth Rate Limiting Rule Group Outputs
# Requirements: 2.1, 2.2, 2.3 - Auth rate limiting
#------------------------------------------------------------------------------
output "auth_rate_limiting_rule_group_arn" {
  description = "ARN of the auth rate limiting rule group"
  value       = var.enable_auth_rate_limiting ? aws_wafv2_rule_group.auth_rate_limiting[0].arn : null
}

output "auth_rate_limiting_rule_group_id" {
  description = "ID of the auth rate limiting rule group"
  value       = var.enable_auth_rate_limiting ? aws_wafv2_rule_group.auth_rate_limiting[0].id : null
}

output "auth_security_rule_group_arn" {
  description = "ARN of the auth security rule group"
  value       = var.enable_auth_security_rules ? aws_wafv2_rule_group.auth_security[0].arn : null
}

output "auth_security_rule_group_id" {
  description = "ID of the auth security rule group"
  value       = var.enable_auth_security_rules ? aws_wafv2_rule_group.auth_security[0].id : null
}

output "auth_waf_log_group_name" {
  description = "Name of the CloudWatch log group for auth WAF blocked requests"
  value       = var.enable_auth_security_rules ? aws_cloudwatch_log_group.auth_waf_blocked[0].name : null
}

output "auth_waf_log_group_arn" {
  description = "ARN of the CloudWatch log group for auth WAF blocked requests"
  value       = var.enable_auth_security_rules ? aws_cloudwatch_log_group.auth_waf_blocked[0].arn : null
}
