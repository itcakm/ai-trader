# Timestream Module - Market Data Time-Series Database
# Creates Timestream database and tables for price, volume, and derived metrics
# Implements Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })

  # Table definitions for market data
  tables = {
    price-data = {
      description = "Time-series data for cryptocurrency prices"
    }
    volume-data = {
      description = "Time-series data for trading volumes"
    }
    derived-metrics = {
      description = "Calculated metrics derived from price and volume data"
    }
  }
}

# Get current AWS account ID and region
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

#------------------------------------------------------------------------------
# Timestream Database
# Requirement 4.1: Create a Timestream database for market data
#------------------------------------------------------------------------------
resource "aws_timestreamwrite_database" "market_data" {
  database_name = "${local.name_prefix}-market-data"

  # Encryption is enabled by default with AWS-managed keys
  # Requirement 4.5: Enable encryption using AWS-managed keys

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-market-data"
    Purpose = "market-data-storage"
  })
}

#------------------------------------------------------------------------------
# Timestream Tables
# Requirement 4.2: Create tables for price data, volume data, and derived metrics
# Requirement 4.3: Configure memory store retention period
# Requirement 4.4: Configure magnetic store retention period
#------------------------------------------------------------------------------
resource "aws_timestreamwrite_table" "tables" {
  for_each = local.tables

  database_name = aws_timestreamwrite_database.market_data.database_name
  table_name    = "${local.name_prefix}-${each.key}"

  # Retention configuration
  # Requirement 4.3: Memory store retention (24h test, 7d production)
  # Requirement 4.4: Magnetic store retention (30d test, 365d production)
  retention_properties {
    memory_store_retention_period_in_hours  = var.memory_store_retention_hours
    magnetic_store_retention_period_in_days = var.magnetic_store_retention_days
  }

  # Enable magnetic store writes for late-arriving data
  magnetic_store_write_properties {
    enable_magnetic_store_writes = var.enable_magnetic_store_writes

    # Configure S3 bucket for rejected records (optional)
    dynamic "magnetic_store_rejected_data_location" {
      for_each = var.rejected_data_s3_bucket_name != null ? [1] : []
      content {
        s3_configuration {
          bucket_name       = var.rejected_data_s3_bucket_name
          object_key_prefix = "${local.name_prefix}/${each.key}/rejected/"
          encryption_option = "SSE_S3"
        }
      }
    }
  }

  tags = merge(local.common_tags, {
    Name        = "${local.name_prefix}-${each.key}"
    TableName   = each.key
    Description = each.value.description
  })
}


#------------------------------------------------------------------------------
# IAM Policies for Timestream Access
# Requirement 4.6: Create appropriate IAM policies for Lambda access
#------------------------------------------------------------------------------

# IAM Policy Document for Timestream Write Access
data "aws_iam_policy_document" "timestream_write" {
  # Allow writing to Timestream tables
  statement {
    sid    = "TimestreamWriteAccess"
    effect = "Allow"
    actions = [
      "timestream:WriteRecords",
      "timestream:DescribeEndpoints"
    ]
    resources = [
      aws_timestreamwrite_database.market_data.arn,
      "${aws_timestreamwrite_database.market_data.arn}/*"
    ]
  }

  # Allow describing tables for write operations
  statement {
    sid    = "TimestreamDescribeForWrite"
    effect = "Allow"
    actions = [
      "timestream:DescribeTable",
      "timestream:DescribeDatabase"
    ]
    resources = [
      aws_timestreamwrite_database.market_data.arn,
      "${aws_timestreamwrite_database.market_data.arn}/*"
    ]
  }
}

# IAM Policy Document for Timestream Read Access
data "aws_iam_policy_document" "timestream_read" {
  # Allow querying Timestream tables
  statement {
    sid    = "TimestreamQueryAccess"
    effect = "Allow"
    actions = [
      "timestream:Select",
      "timestream:DescribeEndpoints",
      "timestream:SelectValues"
    ]
    resources = [
      aws_timestreamwrite_database.market_data.arn,
      "${aws_timestreamwrite_database.market_data.arn}/*"
    ]
  }

  # Allow describing tables for read operations
  statement {
    sid    = "TimestreamDescribeForRead"
    effect = "Allow"
    actions = [
      "timestream:DescribeTable",
      "timestream:DescribeDatabase",
      "timestream:ListTables"
    ]
    resources = [
      aws_timestreamwrite_database.market_data.arn,
      "${aws_timestreamwrite_database.market_data.arn}/*"
    ]
  }
}

# IAM Policy Document for Full Timestream Access (Read + Write)
data "aws_iam_policy_document" "timestream_full" {
  # Combine read and write permissions
  statement {
    sid    = "TimestreamFullAccess"
    effect = "Allow"
    actions = [
      "timestream:WriteRecords",
      "timestream:Select",
      "timestream:SelectValues",
      "timestream:DescribeEndpoints",
      "timestream:DescribeTable",
      "timestream:DescribeDatabase",
      "timestream:ListTables"
    ]
    resources = [
      aws_timestreamwrite_database.market_data.arn,
      "${aws_timestreamwrite_database.market_data.arn}/*"
    ]
  }
}

# IAM Policy for Timestream Write Access
resource "aws_iam_policy" "timestream_write" {
  count = var.create_iam_policies ? 1 : 0

  name        = "${local.name_prefix}-timestream-write"
  description = "IAM policy for writing to Timestream market data tables"
  policy      = data.aws_iam_policy_document.timestream_write.json

  tags = merge(local.common_tags, {
    Name       = "${local.name_prefix}-timestream-write"
    PolicyType = "timestream-write"
  })
}

# IAM Policy for Timestream Read Access
resource "aws_iam_policy" "timestream_read" {
  count = var.create_iam_policies ? 1 : 0

  name        = "${local.name_prefix}-timestream-read"
  description = "IAM policy for reading from Timestream market data tables"
  policy      = data.aws_iam_policy_document.timestream_read.json

  tags = merge(local.common_tags, {
    Name       = "${local.name_prefix}-timestream-read"
    PolicyType = "timestream-read"
  })
}

# IAM Policy for Full Timestream Access (Read + Write)
resource "aws_iam_policy" "timestream_full" {
  count = var.create_iam_policies ? 1 : 0

  name        = "${local.name_prefix}-timestream-full"
  description = "IAM policy for full access to Timestream market data tables"
  policy      = data.aws_iam_policy_document.timestream_full.json

  tags = merge(local.common_tags, {
    Name       = "${local.name_prefix}-timestream-full"
    PolicyType = "timestream-full"
  })
}
