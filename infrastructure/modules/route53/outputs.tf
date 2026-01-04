# Route 53 Module Outputs
# Exposes DNS resources for use by other modules
# Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6

#------------------------------------------------------------------------------
# Hosted Zone Outputs
# Requirements: 18.1 - Create hosted zones for application domains
#------------------------------------------------------------------------------
output "hosted_zone_id" {
  description = "ID of the Route 53 hosted zone"
  value       = var.create_hosted_zone ? aws_route53_zone.main[0].zone_id : var.hosted_zone_id
}

output "hosted_zone_arn" {
  description = "ARN of the Route 53 hosted zone"
  value       = var.create_hosted_zone ? aws_route53_zone.main[0].arn : null
}

output "hosted_zone_name" {
  description = "Name of the Route 53 hosted zone"
  value       = var.create_hosted_zone ? aws_route53_zone.main[0].name : var.domain_name
}

output "name_servers" {
  description = "Name servers for the hosted zone (update at domain registrar)"
  value       = var.create_hosted_zone ? aws_route53_zone.main[0].name_servers : []
}

#------------------------------------------------------------------------------
# CloudFront Record Outputs
# Requirements: 18.2 - Create A records (alias) for CloudFront distribution
#------------------------------------------------------------------------------
output "cloudfront_record_name" {
  description = "Name of the CloudFront A record"
  value       = var.create_cloudfront_record && var.cloudfront_domain_name != null ? aws_route53_record.cloudfront[0].name : null
}

output "cloudfront_record_fqdn" {
  description = "FQDN of the CloudFront A record"
  value       = var.create_cloudfront_record && var.cloudfront_domain_name != null ? aws_route53_record.cloudfront[0].fqdn : null
}

output "www_record_fqdn" {
  description = "FQDN of the www subdomain record"
  value       = var.create_www_record && var.cloudfront_domain_name != null ? aws_route53_record.www[0].fqdn : null
}

#------------------------------------------------------------------------------
# API Gateway Record Outputs
# Requirements: 18.3 - Create A records (alias) for API Gateway custom domain
#------------------------------------------------------------------------------
output "api_gateway_record_name" {
  description = "Name of the API Gateway A record"
  value       = var.create_api_gateway_record && var.api_gateway_domain_name != null ? aws_route53_record.api_gateway[0].name : null
}

output "api_gateway_record_fqdn" {
  description = "FQDN of the API Gateway A record"
  value       = var.create_api_gateway_record && var.api_gateway_domain_name != null ? aws_route53_record.api_gateway[0].fqdn : null
}

#------------------------------------------------------------------------------
# Health Check Outputs
# Requirements: 18.4 - Configure health checks for production endpoints
#------------------------------------------------------------------------------
output "cloudfront_health_check_id" {
  description = "ID of the CloudFront health check"
  value       = var.enable_health_checks && var.environment == "production" ? aws_route53_health_check.cloudfront[0].id : null
}

output "api_health_check_id" {
  description = "ID of the API Gateway health check"
  value       = var.enable_health_checks && var.environment == "production" && var.api_health_check_path != null ? aws_route53_health_check.api_gateway[0].id : null
}

output "cloudfront_health_check_arn" {
  description = "ARN of the CloudFront health check"
  value       = var.enable_health_checks && var.environment == "production" ? aws_route53_health_check.cloudfront[0].arn : null
}

output "api_health_check_arn" {
  description = "ARN of the API Gateway health check"
  value       = var.enable_health_checks && var.environment == "production" && var.api_health_check_path != null ? aws_route53_health_check.api_gateway[0].arn : null
}

#------------------------------------------------------------------------------
# DNSSEC Outputs
# Requirements: 18.6 - Enable DNSSEC for production hosted zones
#------------------------------------------------------------------------------
output "dnssec_enabled" {
  description = "Whether DNSSEC is enabled for the hosted zone"
  value       = var.enable_dnssec && var.environment == "production" && var.create_hosted_zone
}

output "dnssec_key_signing_key_id" {
  description = "ID of the DNSSEC key signing key"
  value       = var.enable_dnssec && var.environment == "production" && var.create_hosted_zone ? aws_route53_key_signing_key.main[0].id : null
}

output "dnssec_ds_record" {
  description = "DS record for DNSSEC (add to parent zone/registrar)"
  value       = var.enable_dnssec && var.environment == "production" && var.create_hosted_zone ? aws_route53_key_signing_key.main[0].ds_record : null
}

#------------------------------------------------------------------------------
# Failover Outputs
# Requirements: 18.5 - Configure failover routing policies for production
#------------------------------------------------------------------------------
output "failover_enabled" {
  description = "Whether failover routing is enabled"
  value       = var.enable_failover && var.environment == "production"
}

output "primary_cloudfront_record_id" {
  description = "ID of the primary CloudFront failover record"
  value       = var.enable_failover && var.environment == "production" && var.cloudfront_domain_name != null ? aws_route53_record.cloudfront_primary[0].id : null
}

output "secondary_cloudfront_record_id" {
  description = "ID of the secondary CloudFront failover record"
  value       = var.enable_failover && var.environment == "production" && var.failover_domain_name != null ? aws_route53_record.cloudfront_secondary[0].id : null
}

#------------------------------------------------------------------------------
# Domain Information
#------------------------------------------------------------------------------
output "domain_name" {
  description = "Primary domain name"
  value       = var.domain_name
}

output "api_domain_name" {
  description = "API domain name"
  value       = var.api_domain_name
}

output "frontend_url" {
  description = "Full URL for the frontend application"
  value       = "https://${var.domain_name}"
}

output "api_url" {
  description = "Full URL for the API"
  value       = "https://${var.api_domain_name}"
}
