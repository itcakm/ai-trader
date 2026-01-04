# IAM Module - S3 and Secrets Manager Policies
# Creates per-bucket S3 policies and per-secret Secrets Manager policies
# Implements Requirements 16.5, 16.6

#------------------------------------------------------------------------------
# Per-Bucket S3 Access Policies
# Requirements: 16.5
#------------------------------------------------------------------------------

# Audit logs bucket - read/write for audit functions
data "aws_iam_policy_document" "s3_audit_logs" {
  count = var.enable_s3_policies ? 1 : 0

  statement {
    sid    = "S3AuditLogsAccess"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ]
    resources = [
      lookup(var.s3_bucket_arns, "audit-logs", "arn:aws:s3:::placeholder"),
      "${lookup(var.s3_bucket_arns, "audit-logs", "arn:aws:s3:::placeholder")}/*"
    ]
  }
}

resource "aws_iam_policy" "s3_audit_logs" {
  count = var.enable_s3_policies ? 1 : 0

  name        = "${local.name_prefix}-s3-audit-logs"
  description = "S3 access policy for audit-logs bucket"
  policy      = data.aws_iam_policy_document.s3_audit_logs[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "s3_audit_logs" {
  count = var.enable_s3_policies ? 1 : 0

  role       = aws_iam_role.lambda_execution["audit"].name
  policy_arn = aws_iam_policy.s3_audit_logs[0].arn
}

# Prompt templates bucket - read for AI intelligence functions
data "aws_iam_policy_document" "s3_prompt_templates" {
  count = var.enable_s3_policies ? 1 : 0

  statement {
    sid    = "S3PromptTemplatesRead"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:ListBucket"
    ]
    resources = [
      lookup(var.s3_bucket_arns, "prompt-templates", "arn:aws:s3:::placeholder"),
      "${lookup(var.s3_bucket_arns, "prompt-templates", "arn:aws:s3:::placeholder")}/*"
    ]
  }
}

resource "aws_iam_policy" "s3_prompt_templates" {
  count = var.enable_s3_policies ? 1 : 0

  name        = "${local.name_prefix}-s3-prompt-templates"
  description = "S3 access policy for prompt-templates bucket"
  policy      = data.aws_iam_policy_document.s3_prompt_templates[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "s3_prompt_templates" {
  count = var.enable_s3_policies ? 1 : 0

  role       = aws_iam_role.lambda_execution["ai-intelligence"].name
  policy_arn = aws_iam_policy.s3_prompt_templates[0].arn
}

# Model outputs bucket - read/write for AI intelligence functions
data "aws_iam_policy_document" "s3_model_outputs" {
  count = var.enable_s3_policies ? 1 : 0

  statement {
    sid    = "S3ModelOutputsAccess"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ]
    resources = [
      lookup(var.s3_bucket_arns, "model-outputs", "arn:aws:s3:::placeholder"),
      "${lookup(var.s3_bucket_arns, "model-outputs", "arn:aws:s3:::placeholder")}/*"
    ]
  }
}

resource "aws_iam_policy" "s3_model_outputs" {
  count = var.enable_s3_policies ? 1 : 0

  name        = "${local.name_prefix}-s3-model-outputs"
  description = "S3 access policy for model-outputs bucket"
  policy      = data.aws_iam_policy_document.s3_model_outputs[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "s3_model_outputs" {
  count = var.enable_s3_policies ? 1 : 0

  role       = aws_iam_role.lambda_execution["ai-intelligence"].name
  policy_arn = aws_iam_policy.s3_model_outputs[0].arn
}

#------------------------------------------------------------------------------
# Per-Secret Secrets Manager Access Policies
# Requirements: 16.6
#------------------------------------------------------------------------------

# Exchange secrets - for exchange integration functions
data "aws_iam_policy_document" "secrets_exchange" {
  count = var.enable_secrets_policies ? 1 : 0

  statement {
    sid    = "SecretsExchangeAccess"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ]
    resources = length(var.exchange_secret_arns) > 0 ? values(var.exchange_secret_arns) : ["arn:aws:secretsmanager:eu-central-1:000000000000:secret:placeholder-exchange"]
  }
}

resource "aws_iam_policy" "secrets_exchange" {
  count = var.enable_secrets_policies ? 1 : 0

  name        = "${local.name_prefix}-secrets-exchange"
  description = "Secrets Manager access policy for exchange credentials"
  policy      = data.aws_iam_policy_document.secrets_exchange[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "secrets_exchange" {
  count = var.enable_secrets_policies ? 1 : 0

  role       = aws_iam_role.lambda_execution["exchange-integration"].name
  policy_arn = aws_iam_policy.secrets_exchange[0].arn
}

# AI provider secrets - for AI intelligence functions
data "aws_iam_policy_document" "secrets_ai_provider" {
  count = var.enable_secrets_policies ? 1 : 0

  statement {
    sid    = "SecretsAIProviderAccess"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ]
    resources = length(var.ai_provider_secret_arns) > 0 ? values(var.ai_provider_secret_arns) : ["arn:aws:secretsmanager:eu-central-1:000000000000:secret:placeholder-ai-provider"]
  }
}

resource "aws_iam_policy" "secrets_ai_provider" {
  count = var.enable_secrets_policies ? 1 : 0

  name        = "${local.name_prefix}-secrets-ai-provider"
  description = "Secrets Manager access policy for AI provider API keys"
  policy      = data.aws_iam_policy_document.secrets_ai_provider[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "secrets_ai_provider" {
  count = var.enable_secrets_policies ? 1 : 0

  role       = aws_iam_role.lambda_execution["ai-intelligence"].name
  policy_arn = aws_iam_policy.secrets_ai_provider[0].arn
}

# Infrastructure secrets (Redis) - for all functions that need cache access
data "aws_iam_policy_document" "secrets_infrastructure" {
  count = var.enable_secrets_policies ? 1 : 0

  statement {
    sid    = "SecretsInfrastructureAccess"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ]
    resources = length(var.infrastructure_secret_arns) > 0 ? values(var.infrastructure_secret_arns) : ["arn:aws:secretsmanager:eu-central-1:000000000000:secret:placeholder-infrastructure"]
  }
}

resource "aws_iam_policy" "secrets_infrastructure" {
  count = var.enable_secrets_policies ? 1 : 0

  name        = "${local.name_prefix}-secrets-infrastructure"
  description = "Secrets Manager access policy for infrastructure secrets"
  policy      = data.aws_iam_policy_document.secrets_infrastructure[0].json

  tags = local.common_tags
}

# Attach infrastructure secrets to all Lambda roles that need Redis access
resource "aws_iam_role_policy_attachment" "secrets_infrastructure_risk" {
  count = var.enable_secrets_policies ? 1 : 0

  role       = aws_iam_role.lambda_execution["risk-controls"].name
  policy_arn = aws_iam_policy.secrets_infrastructure[0].arn
}

resource "aws_iam_role_policy_attachment" "secrets_infrastructure_exchange" {
  count = var.enable_secrets_policies ? 1 : 0

  role       = aws_iam_role.lambda_execution["exchange-integration"].name
  policy_arn = aws_iam_policy.secrets_infrastructure[0].arn
}

resource "aws_iam_role_policy_attachment" "secrets_infrastructure_market" {
  count = var.enable_secrets_policies ? 1 : 0

  role       = aws_iam_role.lambda_execution["market-data"].name
  policy_arn = aws_iam_policy.secrets_infrastructure[0].arn
}

#------------------------------------------------------------------------------
# KMS Key Access Policy
# Requirements: 16.6
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "kms_decrypt" {
  count = var.enable_kms_policies ? 1 : 0

  statement {
    sid    = "KMSDecrypt"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey"
    ]
    resources = length(var.kms_key_arns) > 0 ? var.kms_key_arns : ["arn:aws:kms:*:*:key/placeholder"]
  }
}

resource "aws_iam_policy" "kms_decrypt" {
  count = var.enable_kms_policies ? 1 : 0

  name        = "${local.name_prefix}-kms-decrypt"
  description = "KMS decrypt policy for Lambda functions"
  policy      = data.aws_iam_policy_document.kms_decrypt[0].json

  tags = local.common_tags
}

# Attach KMS policy to all Lambda roles
resource "aws_iam_role_policy_attachment" "kms_decrypt" {
  for_each = var.enable_kms_policies ? aws_iam_role.lambda_execution : {}

  role       = each.value.name
  policy_arn = aws_iam_policy.kms_decrypt[0].arn
}

#------------------------------------------------------------------------------
# Timestream Access Policy
# Requirements: 16.3
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "timestream" {
  count = var.enable_timestream_policies ? 1 : 0

  statement {
    sid    = "TimestreamDescribe"
    effect = "Allow"
    actions = [
      "timestream:DescribeEndpoints"
    ]
    resources = ["*"]
  }

  statement {
    sid    = "TimestreamReadWrite"
    effect = "Allow"
    actions = [
      "timestream:WriteRecords",
      "timestream:Select",
      "timestream:DescribeTable",
      "timestream:ListMeasures"
    ]
    resources = length(var.timestream_table_arns) > 0 ? var.timestream_table_arns : [coalesce(var.timestream_database_arn, "arn:aws:timestream:*:*:database/placeholder")]
  }
}

resource "aws_iam_policy" "timestream" {
  count = var.enable_timestream_policies ? 1 : 0

  name        = "${local.name_prefix}-timestream-access"
  description = "Timestream access policy for Lambda functions"
  policy      = data.aws_iam_policy_document.timestream[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "timestream_market_data" {
  count = var.enable_timestream_policies ? 1 : 0

  role       = aws_iam_role.lambda_execution["market-data"].name
  policy_arn = aws_iam_policy.timestream[0].arn
}

resource "aws_iam_role_policy_attachment" "timestream_ai_intelligence" {
  count = var.enable_timestream_policies ? 1 : 0

  role       = aws_iam_role.lambda_execution["ai-intelligence"].name
  policy_arn = aws_iam_policy.timestream[0].arn
}
