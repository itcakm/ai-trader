# ACM CloudFront Certificate Outputs
# Exposes certificate ARN and validation information for use by CloudFront module

#------------------------------------------------------------------------------
# CloudFront Certificate Outputs
#------------------------------------------------------------------------------
output "certificate_arn" {
  description = "ARN of the CloudFront ACM certificate in us-east-1"
  value       = aws_acm_certificate.cloudfront.arn
}

output "certificate_domain_name" {
  description = "Domain name of the CloudFront certificate"
  value       = aws_acm_certificate.cloudfront.domain_name
}

output "certificate_status" {
  description = "Status of the CloudFront certificate"
  value       = aws_acm_certificate.cloudfront.status
}

output "certificate_domain_validation_options" {
  description = "Domain validation options for the CloudFront certificate"
  value       = aws_acm_certificate.cloudfront.domain_validation_options
}

output "validated_certificate_arn" {
  description = "ARN of the validated CloudFront certificate (use this for CloudFront distribution)"
  value       = var.wait_for_validation && var.create_route53_records && var.route53_zone_id != "" ? aws_acm_certificate_validation.cloudfront[0].certificate_arn : aws_acm_certificate.cloudfront.arn
}

#------------------------------------------------------------------------------
# Validation Record Outputs
#------------------------------------------------------------------------------
output "validation_record_fqdns" {
  description = "FQDNs of the CloudFront certificate validation records"
  value       = var.create_route53_records && var.route53_zone_id != "" ? [for record in aws_route53_record.cloudfront_validation : record.fqdn] : []
}

#------------------------------------------------------------------------------
# Region Information
#------------------------------------------------------------------------------
output "certificate_region" {
  description = "AWS region where the certificate is created (always us-east-1 for CloudFront)"
  value       = "us-east-1"
}
