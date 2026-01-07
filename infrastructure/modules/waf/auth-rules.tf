# WAF Auth Rules - Authentication Endpoint Protection
# Creates rate limiting and security rules for authentication endpoints
# Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9

#------------------------------------------------------------------------------
# Auth Rate Limiting Rule Group - Single consolidated rate limit for all auth endpoints
# AWS WAF allows only 1 rate-based statement per rule group
# Requirements: 2.1, 2.2, 2.3, 2.9 - Rate limiting for auth endpoints
#------------------------------------------------------------------------------
resource "aws_wafv2_rule_group" "auth_rate_limiting" {
  count = var.enable_auth_rate_limiting ? 1 : 0

  name        = "${local.name_prefix}-auth-rate-limiting"
  description = "Rate limiting rules for authentication endpoints"
  scope       = "REGIONAL"
  capacity    = 25

  # Single rate limit rule for all auth endpoints
  # Uses the most restrictive limit (login rate) for all auth paths
  rule {
    name     = "auth-rate-limit"
    priority = 1

    action {
      block {
        custom_response {
          response_code            = 429
          custom_response_body_key = "rate-limited"
          response_header {
            name  = "Retry-After"
            value = "300"
          }
        }
      }
    }

    statement {
      rate_based_statement {
        limit              = var.auth_login_rate_limit
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            search_string         = "/auth/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-auth-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  custom_response_body {
    key          = "rate-limited"
    content      = "{\"error\":\"Too Many Requests\",\"code\":\"RATE_LIMITED\",\"message\":\"You have exceeded the rate limit. Please try again later.\",\"retryAfter\":300}"
    content_type = "APPLICATION_JSON"
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-auth-rate-limiting"
    sampled_requests_enabled   = true
  }

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-auth-rate-limiting"
    Purpose = "auth-rate-limiting"
  })
}


#------------------------------------------------------------------------------
# Auth Security Rule Group
# Requirements: 2.4, 2.5, 2.6, 2.7 - Security rules for auth endpoints
#------------------------------------------------------------------------------
resource "aws_wafv2_rule_group" "auth_security" {
  count = var.enable_auth_security_rules ? 1 : 0

  name        = "${local.name_prefix}-auth-security"
  description = "Security rules for authentication endpoints - SQL injection and XSS protection"
  scope       = "REGIONAL"
  capacity    = 250

  # Rule 1: SQL Injection Protection for Auth Endpoints
  # Requirements: 2.4 - Block requests matching SQL injection patterns
  rule {
    name     = "auth-sql-injection-protection"
    priority = 1

    action {
      block {
        custom_response {
          response_code            = 403
          custom_response_body_key = "blocked-security"
        }
      }
    }

    statement {
      and_statement {
        statement {
          byte_match_statement {
            search_string         = "/auth/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
        statement {
          sqli_match_statement {
            field_to_match {
              body {
                oversize_handling = "CONTINUE"
              }
            }
            text_transformation {
              priority = 0
              type     = "URL_DECODE"
            }
            text_transformation {
              priority = 1
              type     = "HTML_ENTITY_DECODE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-auth-sqli-protection"
      sampled_requests_enabled   = true
    }
  }

  # Rule 2: SQL Injection in Query String
  rule {
    name     = "auth-sql-injection-query-string"
    priority = 2

    action {
      block {
        custom_response {
          response_code            = 403
          custom_response_body_key = "blocked-security"
        }
      }
    }

    statement {
      and_statement {
        statement {
          byte_match_statement {
            search_string         = "/auth/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
        statement {
          sqli_match_statement {
            field_to_match {
              query_string {}
            }
            text_transformation {
              priority = 0
              type     = "URL_DECODE"
            }
            text_transformation {
              priority = 1
              type     = "HTML_ENTITY_DECODE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-auth-sqli-query"
      sampled_requests_enabled   = true
    }
  }

  # Rule 3: XSS Protection for Auth Endpoints - Body
  rule {
    name     = "auth-xss-protection-body"
    priority = 3

    action {
      block {
        custom_response {
          response_code            = 403
          custom_response_body_key = "blocked-security"
        }
      }
    }

    statement {
      and_statement {
        statement {
          byte_match_statement {
            search_string         = "/auth/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
        statement {
          xss_match_statement {
            field_to_match {
              body {
                oversize_handling = "CONTINUE"
              }
            }
            text_transformation {
              priority = 0
              type     = "URL_DECODE"
            }
            text_transformation {
              priority = 1
              type     = "HTML_ENTITY_DECODE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-auth-xss-body"
      sampled_requests_enabled   = true
    }
  }

  # Rule 4: XSS Protection for Auth Endpoints - Query String
  rule {
    name     = "auth-xss-protection-query"
    priority = 4

    action {
      block {
        custom_response {
          response_code            = 403
          custom_response_body_key = "blocked-security"
        }
      }
    }

    statement {
      and_statement {
        statement {
          byte_match_statement {
            search_string         = "/auth/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
        statement {
          xss_match_statement {
            field_to_match {
              query_string {}
            }
            text_transformation {
              priority = 0
              type     = "URL_DECODE"
            }
            text_transformation {
              priority = 1
              type     = "HTML_ENTITY_DECODE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-auth-xss-query"
      sampled_requests_enabled   = true
    }
  }

  # Rule 5: XSS Protection for Auth Endpoints - Headers
  rule {
    name     = "auth-xss-protection-headers"
    priority = 5

    action {
      block {
        custom_response {
          response_code            = 403
          custom_response_body_key = "blocked-security"
        }
      }
    }

    statement {
      and_statement {
        statement {
          byte_match_statement {
            search_string         = "/auth/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
        statement {
          xss_match_statement {
            field_to_match {
              single_header {
                name = "user-agent"
              }
            }
            text_transformation {
              priority = 0
              type     = "URL_DECODE"
            }
            text_transformation {
              priority = 1
              type     = "HTML_ENTITY_DECODE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-auth-xss-headers"
      sampled_requests_enabled   = true
    }
  }

  custom_response_body {
    key          = "blocked-security"
    content      = "{\"error\":\"Forbidden\",\"code\":\"SECURITY_VIOLATION\",\"message\":\"Your request was blocked due to a security policy violation.\"}"
    content_type = "APPLICATION_JSON"
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-auth-security"
    sampled_requests_enabled   = true
  }

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-auth-security"
    Purpose = "auth-security"
  })
}

#------------------------------------------------------------------------------
# CloudWatch Log Group for Auth WAF Blocked Requests
# Requirements: 2.7 - Configure CloudWatch logging for blocked requests
#------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "auth_waf_blocked" {
  count = var.enable_auth_security_rules ? 1 : 0

  name              = "/aws/waf/${local.name_prefix}/auth-blocked-requests"
  retention_in_days = var.auth_waf_log_retention_days

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-auth-waf-blocked"
    Purpose = "auth-waf-logging"
  })
}

#------------------------------------------------------------------------------
# CloudWatch Metric Alarms for Auth Security Events
# Requirements: 2.7 - Monitor blocked requests
#------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "auth_sqli_blocked" {
  count = var.enable_auth_security_rules && var.enable_auth_security_alarms ? 1 : 0

  alarm_name          = "${local.name_prefix}-auth-sqli-blocked"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "${local.name_prefix}-auth-sqli-protection"
  namespace           = "AWS/WAFV2"
  period              = 300
  statistic           = "Sum"
  threshold           = var.auth_sqli_alarm_threshold
  alarm_description   = "SQL injection attempts blocked on auth endpoints"
  treat_missing_data  = "notBreaching"

  dimensions = {
    WebACL = aws_wafv2_web_acl.api_gateway.name
    Region = data.aws_region.current.name
    Rule   = "auth-sql-injection-protection"
  }

  alarm_actions = var.auth_security_alarm_actions
  ok_actions    = var.auth_security_alarm_actions

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-auth-sqli-alarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "auth_xss_blocked" {
  count = var.enable_auth_security_rules && var.enable_auth_security_alarms ? 1 : 0

  alarm_name          = "${local.name_prefix}-auth-xss-blocked"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "${local.name_prefix}-auth-xss-body"
  namespace           = "AWS/WAFV2"
  period              = 300
  statistic           = "Sum"
  threshold           = var.auth_xss_alarm_threshold
  alarm_description   = "XSS attempts blocked on auth endpoints"
  treat_missing_data  = "notBreaching"

  dimensions = {
    WebACL = aws_wafv2_web_acl.api_gateway.name
    Region = data.aws_region.current.name
    Rule   = "auth-xss-protection-body"
  }

  alarm_actions = var.auth_security_alarm_actions
  ok_actions    = var.auth_security_alarm_actions

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-auth-xss-alarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "auth_rate_limit_exceeded" {
  count = var.enable_auth_rate_limiting && var.enable_auth_security_alarms ? 1 : 0

  alarm_name          = "${local.name_prefix}-auth-rate-limit-exceeded"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "${local.name_prefix}-auth-rate-limit"
  namespace           = "AWS/WAFV2"
  period              = 300
  statistic           = "Sum"
  threshold           = var.auth_rate_limit_alarm_threshold
  alarm_description   = "Auth rate limit exceeded - potential brute force attack"
  treat_missing_data  = "notBreaching"

  dimensions = {
    WebACL = aws_wafv2_web_acl.api_gateway.name
    Region = data.aws_region.current.name
    Rule   = "auth-rate-limit"
  }

  alarm_actions = var.auth_security_alarm_actions
  ok_actions    = var.auth_security_alarm_actions

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-auth-rate-limit-alarm"
  })
}
