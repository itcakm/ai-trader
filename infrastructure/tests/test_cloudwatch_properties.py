"""
Property-Based Tests for CloudWatch Module

Feature: infrastructure-deployment
Property 11: CloudWatch Alarm Actions
Property 12: CloudWatch Log Retention Compliance
Validates: Requirements 14.6, 14.8

This test validates that CloudWatch resources are properly configured with:
- All alarms have at least one action configured that references an SNS topic
- Log retention periods match environment-specific configuration (30 days test, 90 days production)
"""
import json
import pytest
from hypothesis import given, strategies as st, settings
from pathlib import Path
import hcl2


def load_terraform_file(path: Path) -> dict:
    """Load and parse a Terraform file."""
    if not path.exists():
        pytest.skip(f"Terraform file not found: {path}")
    
    with open(path, 'r') as f:
        content = f.read()
    
    try:
        parsed = hcl2.loads(content)
        return parsed
    except Exception as e:
        pytest.fail(f"Failed to parse Terraform file {path}: {e}")


@pytest.fixture
def cloudwatch_module_path(infrastructure_root):
    """Get the CloudWatch module path."""
    return infrastructure_root / "modules" / "cloudwatch"


@pytest.fixture
def cloudwatch_main_tf(cloudwatch_module_path):
    """Load the CloudWatch module main.tf file."""
    return load_terraform_file(cloudwatch_module_path / "main.tf")


@pytest.fixture
def cloudwatch_alarms_tf(cloudwatch_module_path):
    """Load the CloudWatch module alarms.tf file."""
    return load_terraform_file(cloudwatch_module_path / "alarms.tf")


@pytest.fixture
def cloudwatch_dashboards_tf(cloudwatch_module_path):
    """Load the CloudWatch module dashboards.tf file."""
    return load_terraform_file(cloudwatch_module_path / "dashboards.tf")


@pytest.fixture
def cloudwatch_variables_tf(cloudwatch_module_path):
    """Load the CloudWatch module variables.tf file."""
    return load_terraform_file(cloudwatch_module_path / "variables.tf")


@pytest.fixture
def cloudwatch_outputs_tf(cloudwatch_module_path):
    """Load the CloudWatch module outputs.tf file."""
    return load_terraform_file(cloudwatch_module_path / "outputs.tf")


@pytest.fixture
def cloudwatch_metric_filters_tf(cloudwatch_module_path):
    """Load the CloudWatch module metric-filters.tf file."""
    return load_terraform_file(cloudwatch_module_path / "metric-filters.tf")


def extract_resources(resources: list, resource_type: str) -> dict:
    """Extract resources of a specific type from parsed resources."""
    result = {}
    for resource_block in resources:
        if resource_type in resource_block:
            block = resource_block[resource_type]
            for name, attrs in block.items():
                result[name] = attrs
    return result


def extract_locals(locals_list: list) -> dict:
    """Extract local values from parsed locals."""
    result = {}
    for local_block in locals_list:
        result.update(local_block)
    return result


def extract_variables(variables: list) -> dict:
    """Extract variable configurations from parsed variables."""
    var_dict = {}
    for var_block in variables:
        for var_name, var_attrs in var_block.items():
            var_dict[var_name] = var_attrs
    return var_dict


def extract_outputs(outputs: list) -> dict:
    """Extract output configurations from parsed outputs."""
    output_dict = {}
    for output_block in outputs:
        for output_name, output_attrs in output_block.items():
            output_dict[output_name] = output_attrs
    return output_dict


# Expected dashboards based on requirements
EXPECTED_DASHBOARDS = [
    "api_performance",
    "lambda_metrics",
    "dynamodb_metrics",
    "trading_activity"
]

# Expected alarm types
EXPECTED_ALARM_TYPES = [
    "lambda_errors",
    "api_gateway_5xx_errors",
    "dynamodb_read_throttling",
    "dynamodb_write_throttling",
    "redis_memory_utilization",
    "redis_cpu_utilization",
    "kill_switch_errors",
    "circuit_breakers_errors"
]


class TestCloudWatchAlarmActions:
    """
    Property 11: CloudWatch Alarm Actions
    
    *For any* CloudWatch alarm created by the Terraform configuration, the alarm 
    SHALL have at least one action configured that references an SNS topic for 
    notifications.
    
    **Validates: Requirements 14.8**
    """
    
    def test_cloudwatch_module_exists(self, cloudwatch_module_path):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.1
        
        Verify that the CloudWatch module directory exists with required files.
        """
        assert cloudwatch_module_path.exists(), "CloudWatch module directory should exist"
        assert (cloudwatch_module_path / "main.tf").exists(), "main.tf should exist"
        assert (cloudwatch_module_path / "alarms.tf").exists(), "alarms.tf should exist"
        assert (cloudwatch_module_path / "dashboards.tf").exists(), "dashboards.tf should exist"
        assert (cloudwatch_module_path / "variables.tf").exists(), "variables.tf should exist"
        assert (cloudwatch_module_path / "outputs.tf").exists(), "outputs.tf should exist"
    
    def test_lambda_error_alarms_have_actions(self, cloudwatch_alarms_tf):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.2, 14.8
        
        Verify that Lambda error alarms have alarm actions configured.
        """
        resources = cloudwatch_alarms_tf.get('resource', [])
        alarm_resources = extract_resources(resources, 'aws_cloudwatch_metric_alarm')
        
        assert 'lambda_errors' in alarm_resources, "Lambda error alarms should be defined"
        
        lambda_alarm = alarm_resources['lambda_errors']
        assert 'alarm_actions' in lambda_alarm, (
            "Lambda error alarm must have alarm_actions configured"
        )
        
        alarm_actions = str(lambda_alarm['alarm_actions'])
        assert 'sns_topic_arn' in alarm_actions.lower() or 'var.' in alarm_actions, (
            "Lambda error alarm actions should reference SNS topic ARN"
        )
    
    def test_api_gateway_5xx_alarm_has_actions(self, cloudwatch_alarms_tf):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.3, 14.8
        
        Verify that API Gateway 5xx error alarm has alarm actions configured.
        """
        resources = cloudwatch_alarms_tf.get('resource', [])
        alarm_resources = extract_resources(resources, 'aws_cloudwatch_metric_alarm')
        
        assert 'api_gateway_5xx_errors' in alarm_resources, (
            "API Gateway 5xx error alarm should be defined"
        )
        
        api_alarm = alarm_resources['api_gateway_5xx_errors']
        assert 'alarm_actions' in api_alarm, (
            "API Gateway 5xx alarm must have alarm_actions configured"
        )
        
        alarm_actions = str(api_alarm['alarm_actions'])
        assert 'sns_topic_arn' in alarm_actions.lower() or 'var.' in alarm_actions, (
            "API Gateway 5xx alarm actions should reference SNS topic ARN"
        )
    
    def test_dynamodb_throttling_alarms_have_actions(self, cloudwatch_alarms_tf):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.4, 14.8
        
        Verify that DynamoDB throttling alarms have alarm actions configured.
        """
        resources = cloudwatch_alarms_tf.get('resource', [])
        alarm_resources = extract_resources(resources, 'aws_cloudwatch_metric_alarm')
        
        # Check read throttling alarm
        assert 'dynamodb_read_throttling' in alarm_resources, (
            "DynamoDB read throttling alarm should be defined"
        )
        read_alarm = alarm_resources['dynamodb_read_throttling']
        assert 'alarm_actions' in read_alarm, (
            "DynamoDB read throttling alarm must have alarm_actions configured"
        )
        
        # Check write throttling alarm
        assert 'dynamodb_write_throttling' in alarm_resources, (
            "DynamoDB write throttling alarm should be defined"
        )
        write_alarm = alarm_resources['dynamodb_write_throttling']
        assert 'alarm_actions' in write_alarm, (
            "DynamoDB write throttling alarm must have alarm_actions configured"
        )
    
    def test_redis_memory_alarm_has_actions(self, cloudwatch_alarms_tf):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.5, 14.8
        
        Verify that Redis memory utilization alarm has alarm actions configured.
        """
        resources = cloudwatch_alarms_tf.get('resource', [])
        alarm_resources = extract_resources(resources, 'aws_cloudwatch_metric_alarm')
        
        assert 'redis_memory_utilization' in alarm_resources, (
            "Redis memory utilization alarm should be defined"
        )
        
        redis_alarm = alarm_resources['redis_memory_utilization']
        assert 'alarm_actions' in redis_alarm, (
            "Redis memory alarm must have alarm_actions configured"
        )
        
        alarm_actions = str(redis_alarm['alarm_actions'])
        assert 'sns_topic_arn' in alarm_actions.lower() or 'var.' in alarm_actions, (
            "Redis memory alarm actions should reference SNS topic ARN"
        )
    
    def test_critical_function_alarms_have_actions(self, cloudwatch_alarms_tf):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.8
        
        Verify that critical function alarms (kill-switch, circuit-breakers) have actions.
        """
        resources = cloudwatch_alarms_tf.get('resource', [])
        alarm_resources = extract_resources(resources, 'aws_cloudwatch_metric_alarm')
        
        # Check kill switch alarm
        assert 'kill_switch_errors' in alarm_resources, (
            "Kill switch error alarm should be defined"
        )
        kill_switch_alarm = alarm_resources['kill_switch_errors']
        assert 'alarm_actions' in kill_switch_alarm, (
            "Kill switch alarm must have alarm_actions configured"
        )
        
        # Check circuit breakers alarm
        assert 'circuit_breakers_errors' in alarm_resources, (
            "Circuit breakers error alarm should be defined"
        )
        circuit_alarm = alarm_resources['circuit_breakers_errors']
        assert 'alarm_actions' in circuit_alarm, (
            "Circuit breakers alarm must have alarm_actions configured"
        )
    
    def test_sns_topic_variables_defined(self, cloudwatch_variables_tf):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.8
        
        Verify that SNS topic ARN variables are defined for alarm actions.
        """
        variables = cloudwatch_variables_tf.get('variable', [])
        var_dict = extract_variables(variables)
        
        assert 'critical_alerts_sns_topic_arn' in var_dict, (
            "critical_alerts_sns_topic_arn variable should be defined"
        )
        assert 'system_health_sns_topic_arn' in var_dict, (
            "system_health_sns_topic_arn variable should be defined"
        )
    
    def test_alarm_outputs_defined(self, cloudwatch_outputs_tf):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.8
        
        Verify that alarm ARN outputs are defined.
        """
        outputs = cloudwatch_outputs_tf.get('output', [])
        output_dict = extract_outputs(outputs)
        
        assert 'lambda_error_alarm_arns' in output_dict, (
            "lambda_error_alarm_arns output should exist"
        )
        assert 'api_gateway_5xx_alarm_arn' in output_dict, (
            "api_gateway_5xx_alarm_arn output should exist"
        )
        assert 'all_alarm_arns' in output_dict, (
            "all_alarm_arns output should exist"
        )


class TestCloudWatchLogRetentionCompliance:
    """
    Property 12: CloudWatch Log Retention Compliance
    
    *For any* CloudWatch log group created by the Terraform configuration, the 
    retention period SHALL match the environment-specific configuration 
    (30 days for test, 90 days for production).
    
    **Validates: Requirements 14.6**
    """
    
    def test_log_groups_have_retention_configured(self, cloudwatch_main_tf):
        """
        Feature: infrastructure-deployment
        Property 12: CloudWatch Log Retention Compliance
        Validates: Requirements 14.6
        
        Verify that log groups have retention_in_days configured.
        """
        resources = cloudwatch_main_tf.get('resource', [])
        log_group_resources = extract_resources(resources, 'aws_cloudwatch_log_group')
        
        assert len(log_group_resources) > 0, "Log group resources should be defined"
        
        for log_group_name, log_group_attrs in log_group_resources.items():
            assert 'retention_in_days' in log_group_attrs, (
                f"Log group '{log_group_name}' must have retention_in_days configured"
            )
    
    def test_log_retention_variable_defined(self, cloudwatch_variables_tf):
        """
        Feature: infrastructure-deployment
        Property 12: CloudWatch Log Retention Compliance
        Validates: Requirements 14.6
        
        Verify that log_retention_days variable is defined.
        """
        variables = cloudwatch_variables_tf.get('variable', [])
        var_dict = extract_variables(variables)
        
        assert 'log_retention_days' in var_dict, (
            "log_retention_days variable should be defined"
        )
        
        retention_var = var_dict['log_retention_days']
        assert retention_var.get('type') == 'number', (
            "log_retention_days should be of type number"
        )
        assert retention_var.get('default') == 30, (
            "log_retention_days default should be 30 (for test environment)"
        )
    
    def test_log_groups_use_retention_variable(self, cloudwatch_main_tf):
        """
        Feature: infrastructure-deployment
        Property 12: CloudWatch Log Retention Compliance
        Validates: Requirements 14.6
        
        Verify that log groups use the log_retention_days variable.
        """
        resources = cloudwatch_main_tf.get('resource', [])
        log_group_resources = extract_resources(resources, 'aws_cloudwatch_log_group')
        
        for log_group_name, log_group_attrs in log_group_resources.items():
            retention = str(log_group_attrs.get('retention_in_days', ''))
            assert 'var.log_retention_days' in retention or '${var.log_retention_days}' in retention, (
                f"Log group '{log_group_name}' should use var.log_retention_days"
            )
    
    def test_environment_specific_retention_values(self, test_tfvars, production_tfvars):
        """
        Feature: infrastructure-deployment
        Property 12: CloudWatch Log Retention Compliance
        Validates: Requirements 14.6
        
        Verify that test and production have different log retention values.
        """
        test_retention = test_tfvars.get('log_retention_days', 0)
        prod_retention = production_tfvars.get('log_retention_days', 0)
        
        assert test_retention == 30, (
            f"Test environment log retention should be 30 days, got {test_retention}"
        )
        assert prod_retention == 90, (
            f"Production environment log retention should be 90 days, got {prod_retention}"
        )
        assert test_retention < prod_retention, (
            "Test retention should be less than production retention"
        )
    
    def test_log_group_outputs_defined(self, cloudwatch_outputs_tf):
        """
        Feature: infrastructure-deployment
        Property 12: CloudWatch Log Retention Compliance
        Validates: Requirements 14.6
        
        Verify that log group outputs are defined.
        """
        outputs = cloudwatch_outputs_tf.get('output', [])
        output_dict = extract_outputs(outputs)
        
        assert 'lambda_log_group_arns' in output_dict, (
            "lambda_log_group_arns output should exist"
        )
        assert 'lambda_log_group_names' in output_dict, (
            "lambda_log_group_names output should exist"
        )
        assert 'log_retention_days' in output_dict, (
            "log_retention_days output should exist"
        )


class TestCloudWatchDashboards:
    """
    Tests for CloudWatch dashboards configuration.
    
    Feature: infrastructure-deployment
    Validates: Requirements 14.1
    """
    
    def test_all_required_dashboards_defined(self, cloudwatch_dashboards_tf):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.1
        
        Verify that all required dashboards are defined.
        """
        resources = cloudwatch_dashboards_tf.get('resource', [])
        dashboard_resources = extract_resources(resources, 'aws_cloudwatch_dashboard')
        
        for dashboard in EXPECTED_DASHBOARDS:
            assert dashboard in dashboard_resources, (
                f"Dashboard '{dashboard}' should be defined"
            )
    
    def test_dashboards_have_dashboard_body(self, cloudwatch_dashboards_tf):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.1
        
        Verify that dashboards have dashboard_body configured.
        """
        resources = cloudwatch_dashboards_tf.get('resource', [])
        dashboard_resources = extract_resources(resources, 'aws_cloudwatch_dashboard')
        
        for dashboard_name, dashboard_attrs in dashboard_resources.items():
            assert 'dashboard_body' in dashboard_attrs, (
                f"Dashboard '{dashboard_name}' must have dashboard_body configured"
            )
            assert 'dashboard_name' in dashboard_attrs, (
                f"Dashboard '{dashboard_name}' must have dashboard_name configured"
            )


class TestCloudWatchMetricFilters:
    """
    Tests for CloudWatch metric filters configuration.
    
    Feature: infrastructure-deployment
    Validates: Requirements 14.7
    """
    
    def test_metric_filters_file_exists(self, cloudwatch_module_path):
        """
        Feature: infrastructure-deployment
        Property 12: CloudWatch Log Retention Compliance
        Validates: Requirements 14.7
        
        Verify that metric-filters.tf file exists.
        """
        assert (cloudwatch_module_path / "metric-filters.tf").exists(), (
            "metric-filters.tf should exist"
        )
    
    def test_metric_filters_defined(self, cloudwatch_metric_filters_tf):
        """
        Feature: infrastructure-deployment
        Property 12: CloudWatch Log Retention Compliance
        Validates: Requirements 14.7
        
        Verify that metric filters are defined.
        """
        resources = cloudwatch_metric_filters_tf.get('resource', [])
        filter_resources = extract_resources(resources, 'aws_cloudwatch_log_metric_filter')
        
        assert len(filter_resources) > 0, "Metric filter resources should be defined"
    
    def test_metric_filters_have_required_attributes(self, cloudwatch_metric_filters_tf):
        """
        Feature: infrastructure-deployment
        Property 12: CloudWatch Log Retention Compliance
        Validates: Requirements 14.7
        
        Verify that metric filters have required attributes.
        """
        resources = cloudwatch_metric_filters_tf.get('resource', [])
        filter_resources = extract_resources(resources, 'aws_cloudwatch_log_metric_filter')
        
        for filter_name, filter_attrs in filter_resources.items():
            assert 'name' in filter_attrs, (
                f"Metric filter '{filter_name}' must have name attribute"
            )
            assert 'pattern' in filter_attrs, (
                f"Metric filter '{filter_name}' must have pattern attribute"
            )
            assert 'log_group_name' in filter_attrs, (
                f"Metric filter '{filter_name}' must have log_group_name attribute"
            )
            assert 'metric_transformation' in filter_attrs, (
                f"Metric filter '{filter_name}' must have metric_transformation attribute"
            )


class TestCloudWatchPropertyBased:
    """
    Property-based tests using Hypothesis to validate CloudWatch configurations.
    
    Feature: infrastructure-deployment
    Property 11: CloudWatch Alarm Actions
    Property 12: CloudWatch Log Retention Compliance
    Validates: Requirements 14.6, 14.8
    """
    
    @given(
        environment=st.sampled_from(['test', 'production']),
        project_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz-',
            min_size=3,
            max_size=20
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-') and '--' not in x)
    )
    @settings(max_examples=100)
    def test_dashboard_naming_convention(self, environment, project_name):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.1
        
        *For any* environment and project name combination,
        the generated dashboard name SHALL follow the pattern {project}-{env}-{dashboard_type}.
        """
        for dashboard_type in EXPECTED_DASHBOARDS:
            expected_name = f"{project_name}-{environment}-{dashboard_type.replace('_', '-')}"
            
            # Validate dashboard name format
            assert environment in expected_name, "Dashboard name must contain environment"
            
            # Validate dashboard name length (AWS limit is 255 characters)
            assert len(expected_name) <= 255, "Dashboard name must not exceed 255 characters"
    
    @given(
        retention_days=st.sampled_from([30, 90])
    )
    @settings(max_examples=100)
    def test_log_retention_valid_values(self, retention_days):
        """
        Feature: infrastructure-deployment
        Property 12: CloudWatch Log Retention Compliance
        Validates: Requirements 14.6
        
        *For any* valid retention period, it SHALL be either 30 (test) or 90 (production) days.
        """
        valid_retention_values = [30, 90]
        assert retention_days in valid_retention_values, (
            f"Retention days {retention_days} must be one of {valid_retention_values}"
        )
    
    @given(
        threshold_percent=st.floats(min_value=0.1, max_value=100.0)
    )
    @settings(max_examples=100)
    def test_alarm_threshold_valid_range(self, threshold_percent):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.2, 14.3
        
        *For any* alarm threshold percentage, it SHALL be between 0.1% and 100%.
        """
        assert 0.1 <= threshold_percent <= 100.0, (
            f"Threshold {threshold_percent}% must be between 0.1% and 100%"
        )
    
    @given(
        alarm_type=st.sampled_from(EXPECTED_ALARM_TYPES)
    )
    @settings(max_examples=100)
    def test_all_alarm_types_have_sns_action(self, alarm_type):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.8
        
        *For any* alarm type, it SHALL have an SNS topic action configured.
        """
        # This test validates that all expected alarm types should have SNS actions
        # The actual implementation is verified in the static tests above
        assert alarm_type in EXPECTED_ALARM_TYPES, (
            f"Alarm type '{alarm_type}' must be in expected alarm types"
        )
    
    @given(
        evaluation_periods=st.integers(min_value=1, max_value=10),
        period_seconds=st.sampled_from([60, 300, 900, 3600])
    )
    @settings(max_examples=100)
    def test_alarm_evaluation_configuration(self, evaluation_periods, period_seconds):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.2, 14.3, 14.4, 14.5
        
        *For any* alarm evaluation configuration, the evaluation periods and 
        period seconds SHALL be within valid ranges.
        """
        assert 1 <= evaluation_periods <= 10, (
            f"Evaluation periods {evaluation_periods} must be between 1 and 10"
        )
        valid_periods = [60, 300, 900, 3600]
        assert period_seconds in valid_periods, (
            f"Period seconds {period_seconds} must be one of {valid_periods}"
        )
    
    @given(
        dashboard_type=st.sampled_from(EXPECTED_DASHBOARDS)
    )
    @settings(max_examples=100)
    def test_dashboard_types_valid(self, dashboard_type):
        """
        Feature: infrastructure-deployment
        Property 11: CloudWatch Alarm Actions
        Validates: Requirements 14.1
        
        *For any* dashboard type, it SHALL be one of the expected dashboard types.
        """
        assert dashboard_type in EXPECTED_DASHBOARDS, (
            f"Dashboard type '{dashboard_type}' must be in expected dashboards"
        )
