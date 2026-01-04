# ACM Module Outputs
# Exposes certificate ARNs and validation information for use by other modules

#------------------------------------------------------------------------------
# Frontend Certificate Outputs
#------------------------------------------------------------------------------
output "frontend_certificate_arn" {
  description = "ARN of the frontend domain ACM certificate"
  value       = aws_acm_certificate.frontend.arn
}

output "frontend_certificate_domain_name" {
  description = "Domain name of the frontend certificate"
  value       = aws_acm_certificate.frontend.domain_name
}

output "frontend_certificate_status" {
  description = "Status of the frontend certificate"
  value       = aws_acm_certificate.frontend.status
}

output "frontend_certificate_domain_validation_options" {
  description = "Domain validation options for the frontend certificate"
  value       = aws_acm_certificate.frontend.domain_validation_options
}

output "frontend_validated_certificate_arn" {
  description = "ARN of the validated frontend certificate (use this for CloudFront/API Gateway)"
  value       = var.wait_for_validation && var.create_route53_records && var.route53_zone_id != "" ? aws_acm_certificate_validation.frontend[0].certificate_arn : aws_acm_certificate.frontend.arn
}

#------------------------------------------------------------------------------
# API Certificate Outputs
#------------------------------------------------------------------------------
output "api_certificate_arn" {
  description = "ARN of the API domain ACM certificate"
  value       = aws_acm_certificate.api.arn
}

output "api_certificate_domain_name" {
  description = "Domain name of the API certificate"
  value       = aws_acm_certificate.api.domain_name
}

output "api_certificate_status" {
  description = "Status of the API certificate"
  value       = aws_acm_certificate.api.status
}

output "api_certificate_domain_validation_options" {
  description = "Domain validation options for the API certificate"
  value       = aws_acm_certificate.api.domain_validation_options
}

output "api_validated_certificate_arn" {
  description = "ARN of the validated API certificate (use this for API Gateway custom domain)"
  value       = var.wait_for_validation && var.create_route53_records && var.route53_zone_id != "" ? aws_acm_certificate_validation.api[0].certificate_arn : aws_acm_certificate.api.arn
}

#------------------------------------------------------------------------------
# Validation Record Outputs
#------------------------------------------------------------------------------
output "frontend_validation_record_fqdns" {
  description = "FQDNs of the frontend certificate validation records"
  value       = var.create_route53_records && var.route53_zone_id != "" ? [for record in aws_route53_record.frontend_validation : record.fqdn] : []
}

output "api_validation_record_fqdns" {
  description = "FQDNs of the API certificate validation records"
  value       = var.create_route53_records && var.route53_zone_id != "" ? [for record in aws_route53_record.api_validation : record.fqdn] : []
}
