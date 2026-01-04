# Security Groups for Lambda Functions
# Configures least-privilege network access for Lambda functions

#------------------------------------------------------------------------------
# Lambda Security Group
#------------------------------------------------------------------------------
resource "aws_security_group" "lambda" {
  name        = "${local.name_prefix}-lambda-sg"
  description = "Security group for Lambda functions"
  vpc_id      = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-lambda-sg"
  })
}

#------------------------------------------------------------------------------
# Egress Rules for Lambda Security Group
#------------------------------------------------------------------------------

# Allow HTTPS to VPC endpoints (Secrets Manager, CloudWatch Logs)
resource "aws_security_group_rule" "lambda_to_vpc_endpoints" {
  type                     = "egress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.lambda.id
  source_security_group_id = aws_security_group.vpc_endpoints.id
  description              = "Allow HTTPS to VPC interface endpoints"
}

# Allow HTTPS to internet via NAT Gateway (for external APIs like exchanges, AI providers)
resource "aws_security_group_rule" "lambda_to_internet_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  security_group_id = aws_security_group.lambda.id
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "Allow HTTPS to internet via NAT Gateway for external APIs"
}

# Allow Redis connection (default port 6379)
resource "aws_security_group_rule" "lambda_to_redis" {
  type              = "egress"
  from_port         = 6379
  to_port           = 6379
  protocol          = "tcp"
  security_group_id = aws_security_group.lambda.id
  cidr_blocks       = [var.vpc_cidr]
  description       = "Allow Redis connection within VPC"
}

# Allow DynamoDB and S3 via Gateway endpoints (uses prefix lists)
# Gateway endpoints don't require security group rules as they use route tables

#------------------------------------------------------------------------------
# Redis Security Group (placeholder - will be used by ElastiCache module)
#------------------------------------------------------------------------------
resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-sg"
  })
}

# Allow inbound from Lambda functions
resource "aws_security_group_rule" "redis_from_lambda" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  security_group_id        = aws_security_group.redis.id
  source_security_group_id = aws_security_group.lambda.id
  description              = "Allow Redis connections from Lambda functions"
}

# Allow outbound (for cluster replication if multi-AZ)
resource "aws_security_group_rule" "redis_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.redis.id
  cidr_blocks       = [var.vpc_cidr]
  description       = "Allow outbound within VPC for cluster replication"
}
