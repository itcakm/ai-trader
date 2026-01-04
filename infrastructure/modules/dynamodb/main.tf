# DynamoDB Module - Main Configuration
# Creates all 32 DynamoDB tables for the AI-Assisted Crypto Trading System
# Implements Requirements 3.1, 3.2, 3.3

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })

  # Pre-compute GSI sort key attributes for each table
  # This avoids complex conditional logic in the dynamic block
  gsi_sort_key_attrs = {
    for table_name, table_config in local.tables : table_name => {
      for gsi in table_config.gsi : "${gsi.name}-sk" => {
        name = gsi.sort_key
        type = gsi.sort_key_type
      }
      if gsi.sort_key != null &&
      gsi.sort_key != table_config.partition_key &&
      (table_config.sort_key == null || gsi.sort_key != table_config.sort_key)
    }
  }
}

#------------------------------------------------------------------------------
# DynamoDB Tables
# Creates all tables with partition keys, sort keys, and GSIs
# Requirements: 3.1, 3.2, 3.3
#------------------------------------------------------------------------------
resource "aws_dynamodb_table" "tables" {
  for_each = local.tables

  name         = "${local.name_prefix}-${each.key}"
  billing_mode = var.billing_mode
  hash_key     = each.value.partition_key
  range_key    = each.value.sort_key

  # Partition key attribute
  attribute {
    name = each.value.partition_key
    type = each.value.partition_key_type
  }

  # Sort key attribute (if defined)
  dynamic "attribute" {
    for_each = each.value.sort_key != null ? [1] : []
    content {
      name = each.value.sort_key
      type = each.value.sort_key_type
    }
  }

  # GSI partition key attributes
  dynamic "attribute" {
    for_each = { for gsi in each.value.gsi : gsi.name => gsi if gsi.partition_key != each.value.partition_key && gsi.partition_key != each.value.sort_key }
    content {
      name = attribute.value.partition_key
      type = attribute.value.partition_key_type
    }
  }

  # GSI sort key attributes
  dynamic "attribute" {
    for_each = local.gsi_sort_key_attrs[each.key]
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  # Global Secondary Indexes
  dynamic "global_secondary_index" {
    for_each = each.value.gsi
    content {
      name            = global_secondary_index.value.name
      hash_key        = global_secondary_index.value.partition_key
      range_key       = global_secondary_index.value.sort_key
      projection_type = "ALL"

      # For provisioned mode, set read/write capacity
      read_capacity  = var.billing_mode == "PROVISIONED" ? var.gsi_read_capacity : null
      write_capacity = var.billing_mode == "PROVISIONED" ? var.gsi_write_capacity : null
    }
  }

  # Provisioned capacity (only for PROVISIONED billing mode)
  read_capacity  = var.billing_mode == "PROVISIONED" ? var.default_read_capacity : null
  write_capacity = var.billing_mode == "PROVISIONED" ? var.default_write_capacity : null

  # Point-in-time recovery (Requirement 3.4)
  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  # Server-side encryption (Requirement 3.5)
  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  # TTL configuration (Requirement 3.8)
  dynamic "ttl" {
    for_each = each.value.ttl_attribute != null ? [1] : []
    content {
      attribute_name = each.value.ttl_attribute
      enabled        = true
    }
  }

  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-${each.key}"
    TableName = each.key
  })

  lifecycle {
    prevent_destroy = false
  }
}
