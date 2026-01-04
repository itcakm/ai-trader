# ACM CloudFront Certificate - us-east-1
# Creates ACM certificate for CloudFront distribution in us-east-1 (required by CloudFront)
# Requirements: 19.4 - Create certificates in us-east-1 for CloudFront (global requirement)

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 4.0.0"
    }
  }

  # Backend configuration for state storage
  # Uncomment and configure when deploying
  # backend "s3" {
  #   bucket         = "crypto-trading-terraform-state"
  #   key            = "global/acm-cloudfront/terraform.tfstate"
  #   region         = "eu-central-1"
  #   encrypt        = true
  #   dynamodb_table = "crypto-trading-terraform-locks"
  # }
}

# AWS Provider configured for us-east-1 (required for CloudFront certificates)
provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "terraform"
    }
  }
}

# Secondary provider for Route 53 (Route 53 is global but may need different region context)
provider "aws" {
  alias  = "route53"
  region = "us-east-1"

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(
    {
      Environment = var.environment
      Project     = var.project_name
      Module      = "acm-cloudfront"
      ManagedBy   = "terraform"
      Region      = "us-east-1"
    },
    var.tags
  )
}

#------------------------------------------------------------------------------
# CloudFront Certificate (us-east-1)
# Requirements: 19.4 - Create certificates in us-east-1 for CloudFront
# CloudFront requires certificates to be in us-east-1 regardless of where
# other resources are deployed
#------------------------------------------------------------------------------
resource "aws_acm_certificate" "cloudfront" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name    = "${local.name_prefix}-cloudfront-cert"
      Purpose = "cloudfront"
    }
  )
}

#------------------------------------------------------------------------------
# DNS Validation Records for CloudFront Certificate
# Requirements: 19.3 - Configure DNS validation for certificate issuance
#------------------------------------------------------------------------------
resource "aws_route53_record" "cloudfront_validation" {
  provider = aws.route53

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
# Certificate Validation - CloudFront
# Waits for DNS validation to complete
#------------------------------------------------------------------------------
resource "aws_acm_certificate_validation" "cloudfront" {
  count = var.wait_for_validation && var.create_route53_records && var.route53_zone_id != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [for record in aws_route53_record.cloudfront_validation : record.fqdn]

  timeouts {
    create = var.validation_timeout
  }
}
