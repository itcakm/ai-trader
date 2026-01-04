# Step Functions Module - State Machines for AI-Assisted Crypto Trading System
# Creates state machines for trade lifecycle, audit package generation, and data backfill
# Implements Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })
}

# Get current AWS account and region
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

#------------------------------------------------------------------------------
# CloudWatch Log Groups for Step Functions
# Requirements: 11.5
#------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "step_functions" {
  for_each = local.state_machines

  name              = "/aws/vendedlogs/states/${local.name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name         = "${local.name_prefix}-${each.key}-logs"
    StateMachine = each.key
  })
}

#------------------------------------------------------------------------------
# Trade Lifecycle State Machine
# Requirements: 11.1, 11.4, 11.5, 11.7
#------------------------------------------------------------------------------
resource "aws_sfn_state_machine" "trade_lifecycle" {
  name     = "${local.name_prefix}-trade-lifecycle"
  role_arn = var.step_functions_role_arn
  type     = "STANDARD"

  definition = jsonencode({
    Comment = "Trade Lifecycle Workflow - Orchestrates trade execution from signal to completion"
    StartAt = "ValidateSignal"
    States = {
      ValidateSignal = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["risk-profiles"]
          Payload = {
            "action"  = "validate"
            "input.$" = "$"
          }
        }
        ResultPath = "$.validation"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "CheckRiskLimits"
      }

      CheckRiskLimits = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["position-limits"]
          Payload = {
            "action"  = "check"
            "input.$" = "$"
          }
        }
        ResultPath = "$.riskCheck"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "EvaluateRiskDecision"
      }

      EvaluateRiskDecision = {
        Type = "Choice"
        Choices = [
          {
            Variable      = "$.riskCheck.Payload.approved"
            BooleanEquals = true
            Next          = "SubmitOrder"
          }
        ]
        Default = "RejectTrade"
      }

      SubmitOrder = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["exchange-orders"]
          Payload = {
            "action"  = "submit"
            "input.$" = "$"
          }
        }
        ResultPath = "$.orderSubmission"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "WaitForOrderConfirmation"
      }

      WaitForOrderConfirmation = {
        Type    = "Wait"
        Seconds = 5
        Next    = "CheckOrderStatus"
      }

      CheckOrderStatus = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["exchange-orders"]
          Payload = {
            "action"    = "status"
            "orderId.$" = "$.orderSubmission.Payload.orderId"
          }
        }
        ResultPath = "$.orderStatus"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "EvaluateOrderStatus"
      }

      EvaluateOrderStatus = {
        Type = "Choice"
        Choices = [
          {
            Variable     = "$.orderStatus.Payload.status"
            StringEquals = "FILLED"
            Next         = "LogTradeCompletion"
          },
          {
            Variable     = "$.orderStatus.Payload.status"
            StringEquals = "PARTIAL_FILL"
            Next         = "WaitForOrderConfirmation"
          },
          {
            Variable     = "$.orderStatus.Payload.status"
            StringEquals = "REJECTED"
            Next         = "HandleRejection"
          },
          {
            Variable     = "$.orderStatus.Payload.status"
            StringEquals = "CANCELLED"
            Next         = "HandleCancellation"
          }
        ]
        Default = "WaitForOrderConfirmation"
      }

      LogTradeCompletion = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["trade-lifecycle"]
          Payload = {
            "action"  = "complete"
            "input.$" = "$"
          }
        }
        ResultPath = "$.tradeLog"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "UpdatePositions"
      }

      UpdatePositions = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["exchange-positions"]
          Payload = {
            "action"  = "update"
            "input.$" = "$"
          }
        }
        ResultPath = "$.positionUpdate"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "TradeSuccess"
      }

      RejectTrade = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["risk-events"]
          Payload = {
            "action"    = "log"
            "eventType" = "TRADE_REJECTED"
            "input.$"   = "$"
          }
        }
        ResultPath = "$.rejection"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Next = "TradeFailed"
      }

      HandleRejection = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["trade-lifecycle"]
          Payload = {
            "action"  = "rejected"
            "input.$" = "$"
          }
        }
        ResultPath = "$.rejectionLog"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Next = "TradeFailed"
      }

      HandleCancellation = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["trade-lifecycle"]
          Payload = {
            "action"  = "cancelled"
            "input.$" = "$"
          }
        }
        ResultPath = "$.cancellationLog"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Next = "TradeFailed"
      }

      HandleError = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["risk-events"]
          Payload = {
            "action"    = "log"
            "eventType" = "WORKFLOW_ERROR"
            "input.$"   = "$"
          }
        }
        ResultPath = "$.errorLog"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Next = "TradeFailed"
      }

      TradeSuccess = {
        Type = "Succeed"
      }

      TradeFailed = {
        Type  = "Fail"
        Error = "TradeWorkflowFailed"
        Cause = "Trade workflow failed due to rejection, cancellation, or error"
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.step_functions["trade-lifecycle"].arn}:*"
    include_execution_data = true
    level                  = var.environment == "production" ? "ERROR" : "ALL"
  }

  tracing_configuration {
    enabled = true
  }

  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-trade-lifecycle"
    Workflow = "trade-lifecycle"
  })
}


#------------------------------------------------------------------------------
# Audit Package Generation State Machine
# Requirements: 11.2, 11.4, 11.5, 11.7
#------------------------------------------------------------------------------
resource "aws_sfn_state_machine" "audit_package" {
  name     = "${local.name_prefix}-audit-package"
  role_arn = var.step_functions_role_arn
  type     = "STANDARD"

  definition = jsonencode({
    Comment = "Audit Package Generation Workflow - Generates comprehensive audit packages"
    StartAt = "ValidateRequest"
    States = {
      ValidateRequest = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["audit"]
          Payload = {
            "action"  = "validate"
            "input.$" = "$"
          }
        }
        ResultPath = "$.validation"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "GatherTradeData"
      }

      GatherTradeData = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["trade-lifecycle"]
          Payload = {
            "action"  = "export"
            "input.$" = "$"
          }
        }
        ResultPath = "$.tradeData"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "GatherAITraces"
      }

      GatherAITraces = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["ai-traces"]
          Payload = {
            "action"  = "export"
            "input.$" = "$"
          }
        }
        ResultPath = "$.aiTraces"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "GatherRiskEvents"
      }

      GatherRiskEvents = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["risk-events"]
          Payload = {
            "action"  = "export"
            "input.$" = "$"
          }
        }
        ResultPath = "$.riskEvents"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "GatherDataLineage"
      }

      GatherDataLineage = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["data-lineage"]
          Payload = {
            "action"  = "export"
            "input.$" = "$"
          }
        }
        ResultPath = "$.dataLineage"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "CompilePackage"
      }

      CompilePackage = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["audit-packages"]
          Payload = {
            "action"  = "compile"
            "input.$" = "$"
          }
        }
        ResultPath = "$.package"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "GenerateHash"
      }

      GenerateHash = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["audit-packages"]
          Payload = {
            "action"  = "hash"
            "input.$" = "$"
          }
        }
        ResultPath = "$.hash"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "StorePackage"
      }

      StorePackage = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["audit-packages"]
          Payload = {
            "action"  = "store"
            "input.$" = "$"
          }
        }
        ResultPath = "$.storage"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "NotifyCompletion"
      }

      NotifyCompletion = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["audit"]
          Payload = {
            "action"  = "notify"
            "status"  = "COMPLETED"
            "input.$" = "$"
          }
        }
        ResultPath = "$.notification"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "PackageSuccess"
      }

      HandleError = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["audit"]
          Payload = {
            "action"  = "notify"
            "status"  = "FAILED"
            "input.$" = "$"
          }
        }
        ResultPath = "$.errorNotification"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Next = "PackageFailed"
      }

      PackageSuccess = {
        Type = "Succeed"
      }

      PackageFailed = {
        Type  = "Fail"
        Error = "AuditPackageGenerationFailed"
        Cause = "Audit package generation failed due to an error"
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.step_functions["audit-package"].arn}:*"
    include_execution_data = true
    level                  = var.environment == "production" ? "ERROR" : "ALL"
  }

  tracing_configuration {
    enabled = true
  }

  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-audit-package"
    Workflow = "audit-package"
  })
}

#------------------------------------------------------------------------------
# Data Backfill State Machine
# Requirements: 11.3, 11.4, 11.5, 11.7
#------------------------------------------------------------------------------
resource "aws_sfn_state_machine" "data_backfill" {
  name     = "${local.name_prefix}-data-backfill"
  role_arn = var.step_functions_role_arn
  type     = "STANDARD"

  definition = jsonencode({
    Comment = "Data Backfill Workflow - Orchestrates historical data backfill processes"
    StartAt = "ValidateBackfillRequest"
    States = {
      ValidateBackfillRequest = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["backfills"]
          Payload = {
            "action"  = "validate"
            "input.$" = "$"
          }
        }
        ResultPath = "$.validation"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "InitializeBackfill"
      }

      InitializeBackfill = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["backfills"]
          Payload = {
            "action"  = "initialize"
            "input.$" = "$"
          }
        }
        ResultPath = "$.initialization"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "DetermineDataSource"
      }

      DetermineDataSource = {
        Type = "Choice"
        Choices = [
          {
            Variable     = "$.dataType"
            StringEquals = "PRICE"
            Next         = "FetchPriceData"
          },
          {
            Variable     = "$.dataType"
            StringEquals = "NEWS"
            Next         = "FetchNewsData"
          },
          {
            Variable     = "$.dataType"
            StringEquals = "SENTIMENT"
            Next         = "FetchSentimentData"
          },
          {
            Variable     = "$.dataType"
            StringEquals = "ON_CHAIN"
            Next         = "FetchOnChainData"
          }
        ]
        Default = "FetchPriceData"
      }

      FetchPriceData = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["streams"]
          Payload = {
            "action"   = "backfill"
            "dataType" = "PRICE"
            "input.$"  = "$"
          }
        }
        ResultPath = "$.fetchResult"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "ProcessBatch"
      }

      FetchNewsData = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["news-context"]
          Payload = {
            "action"   = "backfill"
            "dataType" = "NEWS"
            "input.$"  = "$"
          }
        }
        ResultPath = "$.fetchResult"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "ProcessBatch"
      }

      FetchSentimentData = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["analysis"]
          Payload = {
            "action"   = "backfill"
            "dataType" = "SENTIMENT"
            "input.$"  = "$"
          }
        }
        ResultPath = "$.fetchResult"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "ProcessBatch"
      }

      FetchOnChainData = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["data-sources"]
          Payload = {
            "action"   = "backfill"
            "dataType" = "ON_CHAIN"
            "input.$"  = "$"
          }
        }
        ResultPath = "$.fetchResult"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "ProcessBatch"
      }

      ProcessBatch = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["backfills"]
          Payload = {
            "action"  = "process"
            "input.$" = "$"
          }
        }
        ResultPath = "$.processResult"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "UpdateProgress"
      }

      UpdateProgress = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["backfills"]
          Payload = {
            "action"  = "progress"
            "input.$" = "$"
          }
        }
        ResultPath = "$.progress"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "CheckCompletion"
      }

      CheckCompletion = {
        Type = "Choice"
        Choices = [
          {
            Variable      = "$.progress.Payload.complete"
            BooleanEquals = true
            Next          = "RunQualityChecks"
          }
        ]
        Default = "WaitBetweenBatches"
      }

      WaitBetweenBatches = {
        Type    = "Wait"
        Seconds = 10
        Next    = "DetermineDataSource"
      }

      RunQualityChecks = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["quality"]
          Payload = {
            "action"  = "validate"
            "input.$" = "$"
          }
        }
        ResultPath = "$.qualityCheck"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "FinalizeBackfill"
      }

      FinalizeBackfill = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["backfills"]
          Payload = {
            "action"  = "finalize"
            "input.$" = "$"
          }
        }
        ResultPath = "$.finalization"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "HandleError"
          }
        ]
        Next = "BackfillSuccess"
      }

      HandleError = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = var.lambda_function_arns["backfills"]
          Payload = {
            "action"  = "error"
            "input.$" = "$"
          }
        }
        ResultPath = "$.errorLog"
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException"]
            IntervalSeconds = 2
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Next = "BackfillFailed"
      }

      BackfillSuccess = {
        Type = "Succeed"
      }

      BackfillFailed = {
        Type  = "Fail"
        Error = "DataBackfillFailed"
        Cause = "Data backfill process failed due to an error"
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.step_functions["data-backfill"].arn}:*"
    include_execution_data = true
    level                  = var.environment == "production" ? "ERROR" : "ALL"
  }

  tracing_configuration {
    enabled = true
  }

  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-data-backfill"
    Workflow = "data-backfill"
  })
}
