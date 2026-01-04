# IAM Module - Service Roles for Orchestration Services
# Creates service roles for Step Functions, EventBridge, and API Gateway
# Implements Requirements 16.2

#------------------------------------------------------------------------------
# Step Functions Service Role
# Requirements: 16.2
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "step_functions_assume_role" {
  statement {
    sid     = "AllowStepFunctionsAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "step_functions" {
  name               = "${local.name_prefix}-step-functions"
  description        = "Service role for Step Functions state machines"
  assume_role_policy = data.aws_iam_policy_document.step_functions_assume_role.json

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-step-functions"
    Service = "step-functions"
  })
}

# Step Functions policy to invoke Lambda functions
data "aws_iam_policy_document" "step_functions_lambda" {
  statement {
    sid    = "InvokeLambda"
    effect = "Allow"
    actions = [
      "lambda:InvokeFunction"
    ]
    resources = [
      "arn:aws:lambda:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:function:${local.name_prefix}-*"
    ]
  }

  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogDelivery",
      "logs:GetLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries",
      "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies",
      "logs:DescribeLogGroups"
    ]
    resources = ["*"]
  }

  statement {
    sid    = "XRayTracing"
    effect = "Allow"
    actions = [
      "xray:PutTraceSegments",
      "xray:PutTelemetryRecords",
      "xray:GetSamplingRules",
      "xray:GetSamplingTargets"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "step_functions_lambda" {
  name        = "${local.name_prefix}-step-functions-lambda"
  description = "Policy for Step Functions to invoke Lambda functions"
  policy      = data.aws_iam_policy_document.step_functions_lambda.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "step_functions_lambda" {
  role       = aws_iam_role.step_functions.name
  policy_arn = aws_iam_policy.step_functions_lambda.arn
}

#------------------------------------------------------------------------------
# EventBridge Service Role
# Requirements: 16.2
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "eventbridge_assume_role" {
  statement {
    sid     = "AllowEventBridgeAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eventbridge" {
  name               = "${local.name_prefix}-eventbridge"
  description        = "Service role for EventBridge rules"
  assume_role_policy = data.aws_iam_policy_document.eventbridge_assume_role.json

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-eventbridge"
    Service = "eventbridge"
  })
}

# EventBridge policy to invoke Lambda functions and Step Functions
data "aws_iam_policy_document" "eventbridge_targets" {
  statement {
    sid    = "InvokeLambda"
    effect = "Allow"
    actions = [
      "lambda:InvokeFunction"
    ]
    resources = [
      "arn:aws:lambda:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:function:${local.name_prefix}-*"
    ]
  }

  statement {
    sid    = "StartStepFunctions"
    effect = "Allow"
    actions = [
      "states:StartExecution"
    ]
    resources = [
      "arn:aws:states:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:stateMachine:${local.name_prefix}-*"
    ]
  }

  statement {
    sid    = "PublishSNS"
    effect = "Allow"
    actions = [
      "sns:Publish"
    ]
    resources = length(var.sns_topic_arns) > 0 ? var.sns_topic_arns : [
      "arn:aws:sns:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:${local.name_prefix}-*"
    ]
  }
}

resource "aws_iam_policy" "eventbridge_targets" {
  name        = "${local.name_prefix}-eventbridge-targets"
  description = "Policy for EventBridge to invoke targets"
  policy      = data.aws_iam_policy_document.eventbridge_targets.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "eventbridge_targets" {
  role       = aws_iam_role.eventbridge.name
  policy_arn = aws_iam_policy.eventbridge_targets.arn
}

#------------------------------------------------------------------------------
# API Gateway CloudWatch Logging Role
# Requirements: 16.2
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "api_gateway_assume_role" {
  statement {
    sid     = "AllowAPIGatewayAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["apigateway.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api_gateway_cloudwatch" {
  name               = "${local.name_prefix}-api-gateway-cloudwatch"
  description        = "Service role for API Gateway CloudWatch logging"
  assume_role_policy = data.aws_iam_policy_document.api_gateway_assume_role.json

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-api-gateway-cloudwatch"
    Service = "api-gateway"
  })
}

# API Gateway CloudWatch logging policy
data "aws_iam_policy_document" "api_gateway_cloudwatch" {
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
      "logs:PutLogEvents",
      "logs:GetLogEvents",
      "logs:FilterLogEvents"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "api_gateway_cloudwatch" {
  name        = "${local.name_prefix}-api-gateway-cloudwatch"
  description = "Policy for API Gateway CloudWatch logging"
  policy      = data.aws_iam_policy_document.api_gateway_cloudwatch.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch" {
  role       = aws_iam_role.api_gateway_cloudwatch.name
  policy_arn = aws_iam_policy.api_gateway_cloudwatch.arn
}

#------------------------------------------------------------------------------
# IAM Access Analyzer
# Requirements: 16.7
#------------------------------------------------------------------------------
resource "aws_accessanalyzer_analyzer" "main" {
  analyzer_name = "${local.name_prefix}-access-analyzer"
  type          = "ACCOUNT"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-access-analyzer"
  })
}
