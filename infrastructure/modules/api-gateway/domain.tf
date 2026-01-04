# API Gateway Custom Domain Configuration
# Configures custom domain with ACM certificate
# Requirements: 7.8

#------------------------------------------------------------------------------
# Custom Domain Name
# Requirements: 7.8 - Configure custom domain with ACM certificate
#------------------------------------------------------------------------------
resource "aws_api_gateway_domain_name" "main" {
  domain_name              = var.api_domain_name
  regional_certificate_arn = var.certificate_arn

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  security_policy = "TLS_1_2"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api-domain"
  })
}

#------------------------------------------------------------------------------
# Base Path Mapping
# Maps the custom domain to the API stage
#------------------------------------------------------------------------------
resource "aws_api_gateway_base_path_mapping" "main" {
  api_id      = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  domain_name = aws_api_gateway_domain_name.main.domain_name
  base_path   = ""
}
