# Route 53 Module - DNS Management
# Creates hosted zones and DNS records for application domains
# Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    Module      = "route53"
    ManagedBy   = "terraform"
  })

  # Determine if this is production environment for conditional resources
  is_production = var.environment == "production"
}

#------------------------------------------------------------------------------
# Hosted Zone for Application Domain
# Requirements: 18.1 - Create hosted zones for application domains
#------------------------------------------------------------------------------
resource "aws_route53_zone" "main" {
  count = var.create_hosted_zone ? 1 : 0

  name    = var.domain_name
  comment = "Hosted zone for ${local.name_prefix} - ${var.domain_name}"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-zone"
  })
}

#------------------------------------------------------------------------------
# A Record (Alias) for CloudFront Distribution
# Requirements: 18.2 - Create A records (alias) for CloudFront distribution
#------------------------------------------------------------------------------
resource "aws_route53_record" "cloudfront" {
  count = var.create_cloudfront_record && var.cloudfront_domain_name != null ? 1 : 0

  zone_id = var.create_hosted_zone ? aws_route53_zone.main[0].zone_id : var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = var.evaluate_target_health
  }
}

# IPv6 AAAA Record for CloudFront Distribution
resource "aws_route53_record" "cloudfront_ipv6" {
  count = var.create_cloudfront_record && var.cloudfront_domain_name != null && var.enable_ipv6 ? 1 : 0

  zone_id = var.create_hosted_zone ? aws_route53_zone.main[0].zone_id : var.hosted_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = var.evaluate_target_health
  }
}

#------------------------------------------------------------------------------
# A Record (Alias) for API Gateway Custom Domain
# Requirements: 18.3 - Create A records (alias) for API Gateway custom domain
#------------------------------------------------------------------------------
resource "aws_route53_record" "api_gateway" {
  count = var.create_api_gateway_record && var.api_gateway_domain_name != null ? 1 : 0

  zone_id = var.create_hosted_zone ? aws_route53_zone.main[0].zone_id : var.hosted_zone_id
  name    = var.api_domain_name
  type    = "A"

  alias {
    name                   = var.api_gateway_domain_name
    zone_id                = var.api_gateway_hosted_zone_id
    evaluate_target_health = var.evaluate_target_health
  }
}

# IPv6 AAAA Record for API Gateway
resource "aws_route53_record" "api_gateway_ipv6" {
  count = var.create_api_gateway_record && var.api_gateway_domain_name != null && var.enable_ipv6 ? 1 : 0

  zone_id = var.create_hosted_zone ? aws_route53_zone.main[0].zone_id : var.hosted_zone_id
  name    = var.api_domain_name
  type    = "AAAA"

  alias {
    name                   = var.api_gateway_domain_name
    zone_id                = var.api_gateway_hosted_zone_id
    evaluate_target_health = var.evaluate_target_health
  }
}

#------------------------------------------------------------------------------
# WWW Subdomain Record (Optional)
# Redirects www.domain.com to domain.com via CloudFront
#------------------------------------------------------------------------------
resource "aws_route53_record" "www" {
  count = var.create_www_record && var.cloudfront_domain_name != null ? 1 : 0

  zone_id = var.create_hosted_zone ? aws_route53_zone.main[0].zone_id : var.hosted_zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = var.evaluate_target_health
  }
}

#------------------------------------------------------------------------------
# Health Check for CloudFront Endpoint
# Requirements: 18.4 - Configure health checks for production endpoints
#------------------------------------------------------------------------------
resource "aws_route53_health_check" "cloudfront" {
  count = var.enable_health_checks && local.is_production ? 1 : 0

  fqdn              = var.domain_name
  port              = 443
  type              = "HTTPS"
  resource_path     = var.health_check_path
  failure_threshold = var.health_check_failure_threshold
  request_interval  = var.health_check_request_interval

  regions = var.health_check_regions

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-cloudfront-health-check"
  })
}

#------------------------------------------------------------------------------
# Health Check for API Gateway Endpoint
# Requirements: 18.4 - Configure health checks for production endpoints
#------------------------------------------------------------------------------
resource "aws_route53_health_check" "api_gateway" {
  count = var.enable_health_checks && local.is_production && var.api_health_check_path != null ? 1 : 0

  fqdn              = var.api_domain_name
  port              = 443
  type              = "HTTPS"
  resource_path     = var.api_health_check_path
  failure_threshold = var.health_check_failure_threshold
  request_interval  = var.health_check_request_interval

  regions = var.health_check_regions

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api-health-check"
  })
}

#------------------------------------------------------------------------------
# CloudWatch Alarm for Health Check (CloudFront)
#------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "cloudfront_health" {
  count = var.enable_health_checks && local.is_production && var.sns_topic_arn != null ? 1 : 0

  alarm_name          = "${local.name_prefix}-cloudfront-health-alarm"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HealthCheckStatus"
  namespace           = "AWS/Route53"
  period              = 60
  statistic           = "Minimum"
  threshold           = 1
  alarm_description   = "CloudFront endpoint health check failed"

  dimensions = {
    HealthCheckId = aws_route53_health_check.cloudfront[0].id
  }

  alarm_actions = [var.sns_topic_arn]
  ok_actions    = [var.sns_topic_arn]

  tags = local.common_tags
}

#------------------------------------------------------------------------------
# CloudWatch Alarm for Health Check (API Gateway)
#------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "api_health" {
  count = var.enable_health_checks && local.is_production && var.api_health_check_path != null && var.sns_topic_arn != null ? 1 : 0

  alarm_name          = "${local.name_prefix}-api-health-alarm"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HealthCheckStatus"
  namespace           = "AWS/Route53"
  period              = 60
  statistic           = "Minimum"
  threshold           = 1
  alarm_description   = "API Gateway endpoint health check failed"

  dimensions = {
    HealthCheckId = aws_route53_health_check.api_gateway[0].id
  }

  alarm_actions = [var.sns_topic_arn]
  ok_actions    = [var.sns_topic_arn]

  tags = local.common_tags
}

#------------------------------------------------------------------------------
# DNSSEC Configuration
# Requirements: 18.6 - Enable DNSSEC for production hosted zones
#------------------------------------------------------------------------------
resource "aws_route53_key_signing_key" "main" {
  count = var.enable_dnssec && local.is_production && var.create_hosted_zone ? 1 : 0

  hosted_zone_id             = aws_route53_zone.main[0].zone_id
  key_management_service_arn = var.dnssec_kms_key_arn
  name                       = "${local.name_prefix}-ksk"
}

resource "aws_route53_hosted_zone_dnssec" "main" {
  count = var.enable_dnssec && local.is_production && var.create_hosted_zone ? 1 : 0

  hosted_zone_id = aws_route53_zone.main[0].zone_id

  depends_on = [aws_route53_key_signing_key.main]
}

#------------------------------------------------------------------------------
# Failover Routing - Primary Record (CloudFront)
# Requirements: 18.5 - Configure failover routing policies for production
#------------------------------------------------------------------------------
resource "aws_route53_record" "cloudfront_primary" {
  count = var.enable_failover && local.is_production && var.cloudfront_domain_name != null ? 1 : 0

  zone_id = var.create_hosted_zone ? aws_route53_zone.main[0].zone_id : var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  failover_routing_policy {
    type = "PRIMARY"
  }

  set_identifier  = "primary"
  health_check_id = aws_route53_health_check.cloudfront[0].id

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = true
  }
}

#------------------------------------------------------------------------------
# Failover Routing - Secondary Record (Failover CloudFront or S3)
# Requirements: 18.5 - Configure failover routing policies for production
#------------------------------------------------------------------------------
resource "aws_route53_record" "cloudfront_secondary" {
  count = var.enable_failover && local.is_production && var.failover_domain_name != null ? 1 : 0

  zone_id = var.create_hosted_zone ? aws_route53_zone.main[0].zone_id : var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  failover_routing_policy {
    type = "SECONDARY"
  }

  set_identifier = "secondary"

  alias {
    name                   = var.failover_domain_name
    zone_id                = var.failover_hosted_zone_id
    evaluate_target_health = false
  }
}

#------------------------------------------------------------------------------
# Failover Routing - Primary API Record
# Requirements: 18.5 - Configure failover routing policies for production
#------------------------------------------------------------------------------
resource "aws_route53_record" "api_primary" {
  count = var.enable_failover && local.is_production && var.api_gateway_domain_name != null && var.api_health_check_path != null ? 1 : 0

  zone_id = var.create_hosted_zone ? aws_route53_zone.main[0].zone_id : var.hosted_zone_id
  name    = var.api_domain_name
  type    = "A"

  failover_routing_policy {
    type = "PRIMARY"
  }

  set_identifier  = "api-primary"
  health_check_id = aws_route53_health_check.api_gateway[0].id

  alias {
    name                   = var.api_gateway_domain_name
    zone_id                = var.api_gateway_hosted_zone_id
    evaluate_target_health = true
  }
}

#------------------------------------------------------------------------------
# Failover Routing - Secondary API Record
# Requirements: 18.5 - Configure failover routing policies for production
#------------------------------------------------------------------------------
resource "aws_route53_record" "api_secondary" {
  count = var.enable_failover && local.is_production && var.api_failover_domain_name != null ? 1 : 0

  zone_id = var.create_hosted_zone ? aws_route53_zone.main[0].zone_id : var.hosted_zone_id
  name    = var.api_domain_name
  type    = "A"

  failover_routing_policy {
    type = "SECONDARY"
  }

  set_identifier = "api-secondary"

  alias {
    name                   = var.api_failover_domain_name
    zone_id                = var.api_failover_hosted_zone_id
    evaluate_target_health = false
  }
}
