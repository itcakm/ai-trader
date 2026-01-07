# CloudFront Module Outputs
# Exposes CloudFront distribution information for use by other modules
# Requirements: 10.1, 10.6

#------------------------------------------------------------------------------
# Distribution Outputs
#------------------------------------------------------------------------------
output "distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.id
}

output "distribution_arn" {
  description = "ARN of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.arn
}

output "distribution_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "distribution_hosted_zone_id" {
  description = "Route 53 hosted zone ID for the CloudFront distribution (for alias records)"
  value       = aws_cloudfront_distribution.main.hosted_zone_id
}

output "distribution_status" {
  description = "Current status of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.status
}

output "distribution_etag" {
  description = "ETag of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.etag
}

#------------------------------------------------------------------------------
# Origin Access Identity Outputs
# Requirements: 10.6 - Configure origin access identity for S3 bucket access
#------------------------------------------------------------------------------
output "origin_access_identity_id" {
  description = "ID of the CloudFront Origin Access Identity"
  value       = aws_cloudfront_origin_access_identity.main.id
}

output "origin_access_identity_iam_arn" {
  description = "IAM ARN of the CloudFront Origin Access Identity"
  value       = aws_cloudfront_origin_access_identity.main.iam_arn
}

output "origin_access_identity_path" {
  description = "CloudFront access identity path for S3 origin configuration"
  value       = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
}

#------------------------------------------------------------------------------
# Cache Policy Outputs
#------------------------------------------------------------------------------
output "static_assets_cache_policy_id" {
  description = "ID of the cache policy for static assets"
  value       = aws_cloudfront_cache_policy.static_assets.id
}

output "dynamic_content_cache_policy_id" {
  description = "ID of the AWS managed CachingDisabled policy for dynamic content"
  value       = data.aws_cloudfront_cache_policy.caching_disabled.id
}

#------------------------------------------------------------------------------
# Response Headers Policy Output
#------------------------------------------------------------------------------
output "security_headers_policy_id" {
  description = "ID of the security headers response policy"
  value       = aws_cloudfront_response_headers_policy.security_headers.id
}

#------------------------------------------------------------------------------
# Domain Information
#------------------------------------------------------------------------------
output "aliases" {
  description = "List of domain aliases configured for the distribution"
  value       = aws_cloudfront_distribution.main.aliases
}

output "primary_domain" {
  description = "Primary custom domain name for the distribution"
  value       = var.domain_name
}
