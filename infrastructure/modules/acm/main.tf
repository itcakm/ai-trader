# ACM Module - SSL/TLS Certificate Management
# Creates ACM certificates for frontend and API domains with DNS validation
# Requirements: 19.1, 19.2, 19.3, 19.5

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(
    {
      Environment = var.environment
      Project     = var.project_name
      Module      = "acm"
      ManagedBy   = "terraform"
    },
    var.tags
  )
}

#------------------------------------------------------------------------------
# Frontend Domain Certificate (Regional - for non-CloudFront use)
# Requirements: 19.1 - Create certificates for frontend domain
#------------------------------------------------------------------------------
resource "aws_acm_certificate" "frontend" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name    = "${local.name_prefix}-frontend-cert"
      Purpose = "frontend"
    }
  )
}

#------------------------------------------------------------------------------
# CloudFront Certificate (us-east-1 - required for CloudFront)
# Requirements: 19.1 - Create certificates for frontend domain
# Note: CloudFront requires certificates in us-east-1
#------------------------------------------------------------------------------
resource "aws_acm_certificate" "cloudfront" {
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = concat(["www.${var.domain_name}"], var.subject_alternative_names)
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name    = "${local.name_prefix}-cloudfront-cert"
      Purpose = "cloudfront"
      Region  = "us-east-1"
    }
  )
}

#------------------------------------------------------------------------------
# API Domain Certificate
# Requirements: 19.2 - Create certificates for API domain
# Requirements: 19.5 - Create certificates in the deployment region for API Gateway
#------------------------------------------------------------------------------
resource "aws_acm_certificate" "api" {
  domain_name               = var.api_domain_name
  subject_alternative_names = var.api_subject_alternative_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name    = "${local.name_prefix}-api-cert"
      Purpose = "api-gateway"
    }
  )
}

#------------------------------------------------------------------------------
# DNS Validation Records for Frontend Certificate
# Requirements: 19.3 - Configure DNS validation for certificate issuance
#------------------------------------------------------------------------------
resource "aws_route53_record" "frontend_validation" {
  for_each = var.create_route53_records && var.route53_zone_id != "" ? {
    for dvo in aws_acm_certificate.frontend.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.route53_zone_id
}

#------------------------------------------------------------------------------
# DNS Validation Records for CloudFront Certificate (us-east-1)
# Requirements: 19.3 - Configure DNS validation for certificate issuance
# Note: DNS records are region-agnostic, so we create them with the default provider
#------------------------------------------------------------------------------
resource "aws_route53_record" "cloudfront_validation" {
  for_each = var.create_route53_records && var.route53_zone_id != "" ? {
    for dvo in aws_acm_certificate.cloudfront.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.route53_zone_id
}

#------------------------------------------------------------------------------
# DNS Validation Records for API Certificate
# Requirements: 19.3 - Configure DNS validation for certificate issuance
#------------------------------------------------------------------------------
resource "aws_route53_record" "api_validation" {
  for_each = var.create_route53_records && var.route53_zone_id != "" ? {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.route53_zone_id
}

#------------------------------------------------------------------------------
# Certificate Validation - Frontend
# Waits for DNS validation to complete
#------------------------------------------------------------------------------
resource "aws_acm_certificate_validation" "frontend" {
  count = var.wait_for_validation && var.create_route53_records && var.route53_zone_id != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for record in aws_route53_record.frontend_validation : record.fqdn]

  timeouts {
    create = var.validation_timeout
  }
}

#------------------------------------------------------------------------------
# Certificate Validation - CloudFront (us-east-1)
# Waits for DNS validation to complete
#------------------------------------------------------------------------------
resource "aws_acm_certificate_validation" "cloudfront" {
  provider = aws.us_east_1
  count    = var.wait_for_validation && var.create_route53_records && var.route53_zone_id != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [for record in aws_route53_record.cloudfront_validation : record.fqdn]

  timeouts {
    create = var.validation_timeout
  }
}

#------------------------------------------------------------------------------
# Certificate Validation - API
# Waits for DNS validation to complete
#------------------------------------------------------------------------------
resource "aws_acm_certificate_validation" "api" {
  count = var.wait_for_validation && var.create_route53_records && var.route53_zone_id != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for record in aws_route53_record.api_validation : record.fqdn]

  timeouts {
    create = var.validation_timeout
  }
}
