# DynamoDB Module - Auto-scaling Configuration
# Creates auto-scaling targets and policies for provisioned capacity mode
# Requirement: 3.7

#------------------------------------------------------------------------------
# Auto-scaling Targets for Table Read Capacity
#------------------------------------------------------------------------------
resource "aws_appautoscaling_target" "table_read" {
  for_each = var.enable_autoscaling && var.billing_mode == "PROVISIONED" ? local.tables : {}

  max_capacity       = contains(var.high_throughput_tables, each.key) ? var.high_throughput_max_read_capacity : var.autoscaling_max_read_capacity
  min_capacity       = contains(var.high_throughput_tables, each.key) ? var.high_throughput_read_capacity : var.autoscaling_min_read_capacity
  resource_id        = "table/${aws_dynamodb_table.tables[each.key].name}"
  scalable_dimension = "dynamodb:table:ReadCapacityUnits"
  service_namespace  = "dynamodb"
}

#------------------------------------------------------------------------------
# Auto-scaling Targets for Table Write Capacity
#------------------------------------------------------------------------------
resource "aws_appautoscaling_target" "table_write" {
  for_each = var.enable_autoscaling && var.billing_mode == "PROVISIONED" ? local.tables : {}

  max_capacity       = contains(var.high_throughput_tables, each.key) ? var.high_throughput_max_write_capacity : var.autoscaling_max_write_capacity
  min_capacity       = contains(var.high_throughput_tables, each.key) ? var.high_throughput_write_capacity : var.autoscaling_min_write_capacity
  resource_id        = "table/${aws_dynamodb_table.tables[each.key].name}"
  scalable_dimension = "dynamodb:table:WriteCapacityUnits"
  service_namespace  = "dynamodb"
}

#------------------------------------------------------------------------------
# Auto-scaling Policies for Table Read Capacity
#------------------------------------------------------------------------------
resource "aws_appautoscaling_policy" "table_read" {
  for_each = var.enable_autoscaling && var.billing_mode == "PROVISIONED" ? local.tables : {}

  name               = "${aws_dynamodb_table.tables[each.key].name}-read-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.table_read[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.table_read[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.table_read[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "DynamoDBReadCapacityUtilization"
    }
    target_value       = var.autoscaling_target_utilization
    scale_in_cooldown  = 60
    scale_out_cooldown = 60
  }
}

#------------------------------------------------------------------------------
# Auto-scaling Policies for Table Write Capacity
#------------------------------------------------------------------------------
resource "aws_appautoscaling_policy" "table_write" {
  for_each = var.enable_autoscaling && var.billing_mode == "PROVISIONED" ? local.tables : {}

  name               = "${aws_dynamodb_table.tables[each.key].name}-write-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.table_write[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.table_write[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.table_write[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "DynamoDBWriteCapacityUtilization"
    }
    target_value       = var.autoscaling_target_utilization
    scale_in_cooldown  = 60
    scale_out_cooldown = 60
  }
}

#------------------------------------------------------------------------------
# Auto-scaling Targets for GSI Read Capacity
#------------------------------------------------------------------------------
locals {
  # Flatten GSIs for auto-scaling
  gsi_autoscaling = var.enable_autoscaling && var.billing_mode == "PROVISIONED" ? flatten([
    for table_name, table_config in local.tables : [
      for gsi in table_config.gsi : {
        table_name = table_name
        gsi_name   = gsi.name
        key        = "${table_name}-${gsi.name}"
      }
    ]
  ]) : []

  gsi_autoscaling_map = { for gsi in local.gsi_autoscaling : gsi.key => gsi }
}

resource "aws_appautoscaling_target" "gsi_read" {
  for_each = local.gsi_autoscaling_map

  max_capacity       = contains(var.high_throughput_tables, each.value.table_name) ? var.high_throughput_max_read_capacity : var.autoscaling_max_read_capacity
  min_capacity       = contains(var.high_throughput_tables, each.value.table_name) ? var.high_throughput_read_capacity : var.autoscaling_min_read_capacity
  resource_id        = "table/${aws_dynamodb_table.tables[each.value.table_name].name}/index/${each.value.gsi_name}"
  scalable_dimension = "dynamodb:index:ReadCapacityUnits"
  service_namespace  = "dynamodb"
}

#------------------------------------------------------------------------------
# Auto-scaling Targets for GSI Write Capacity
#------------------------------------------------------------------------------
resource "aws_appautoscaling_target" "gsi_write" {
  for_each = local.gsi_autoscaling_map

  max_capacity       = contains(var.high_throughput_tables, each.value.table_name) ? var.high_throughput_max_write_capacity : var.autoscaling_max_write_capacity
  min_capacity       = contains(var.high_throughput_tables, each.value.table_name) ? var.high_throughput_write_capacity : var.autoscaling_min_write_capacity
  resource_id        = "table/${aws_dynamodb_table.tables[each.value.table_name].name}/index/${each.value.gsi_name}"
  scalable_dimension = "dynamodb:index:WriteCapacityUnits"
  service_namespace  = "dynamodb"
}

#------------------------------------------------------------------------------
# Auto-scaling Policies for GSI Read Capacity
#------------------------------------------------------------------------------
resource "aws_appautoscaling_policy" "gsi_read" {
  for_each = local.gsi_autoscaling_map

  name               = "${aws_dynamodb_table.tables[each.value.table_name].name}-${each.value.gsi_name}-read-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.gsi_read[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.gsi_read[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.gsi_read[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "DynamoDBReadCapacityUtilization"
    }
    target_value       = var.autoscaling_target_utilization
    scale_in_cooldown  = 60
    scale_out_cooldown = 60
  }
}

#------------------------------------------------------------------------------
# Auto-scaling Policies for GSI Write Capacity
#------------------------------------------------------------------------------
resource "aws_appautoscaling_policy" "gsi_write" {
  for_each = local.gsi_autoscaling_map

  name               = "${aws_dynamodb_table.tables[each.value.table_name].name}-${each.value.gsi_name}-write-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.gsi_write[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.gsi_write[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.gsi_write[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "DynamoDBWriteCapacityUtilization"
    }
    target_value       = var.autoscaling_target_utilization
    scale_in_cooldown  = 60
    scale_out_cooldown = 60
  }
}
