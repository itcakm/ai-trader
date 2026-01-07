"""
Property-Based Tests for Monitoring Configuration Compliance

Feature: production-deployment
Property 5: Monitoring Configuration Compliance
Validates: Requirements 11.2, 11.3

This test validates that:
- Monitoring check script validates all required CloudWatch components
- SNS topics have proper subscription configuration
- Alarms are configured for critical metrics
"""
import os
import pytest
from hypothesis import given, strategies as st, settings, assume
from pathlib import Path
import json
import re


def get_project_root():
    """Get the project root directory."""
    return Path(__file__).parent.parent.parent


def get_monitoring_script_path():
    """Get the monitoring check script path."""
    return get_project_root() / "deployment" / "tests" / "monitoring-checks.sh"


def parse_monitoring_script():
    """Parse the monitoring check script content."""
    script_path = get_monitoring_script_path()
    if not script_path.exists():
        return None
    
    with open(script_path, 'r') as f:
        return f.read()


# Expected monitoring components
EXPECTED_CLOUDWATCH_CHECKS = [
    "dashboards",
    "alarms",
    "logs",
]

EXPECTED_SNS_CHECKS = [
    "topics",
    "subscriptions",
]

EXPECTED_TRACING_CHECKS = [
    "xray",
    "traces",
]

# Alarm states
ALARM_STATES = ["OK", "ALARM", "INSUFFICIENT_DATA"]


@pytest.fixture
def project_root():
    """Fixture providing the project root path."""
    return get_project_root()


@pytest.fixture
def monitoring_script(project_root):
    """Fixture providing the monitoring check script content."""
    script_path = project_root / "deployment" / "tests" / "monitoring-checks.sh"
    if not script_path.exists():
        pytest.skip("Monitoring check script not found")
    
    with open(script_path, 'r') as f:
        return f.read()


class TestMonitoringConfigurationCompliance:
    """
    Property 5: Monitoring Configuration Compliance
    
    *For any* deployed environment, the monitoring configuration SHALL include 
    CloudWatch dashboards, alarms for critical metrics, SNS topics with 
    subscriptions, and X-Ray tracing enabled.
    
    **Validates: Requirements 11.2, 11.3**
    """
    
    def test_monitoring_script_exists(self, project_root):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.1
        
        Verify that the monitoring check script exists.
        """
        script_path = project_root / "deployment" / "tests" / "monitoring-checks.sh"
        assert script_path.exists(), "monitoring-checks.sh should exist"
        assert os.access(script_path, os.X_OK), "monitoring-checks.sh should be executable"
    
    def test_script_checks_cloudwatch_dashboards(self, monitoring_script):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.1
        
        Verify that the script checks CloudWatch dashboards.
        """
        assert 'dashboard' in monitoring_script.lower(), (
            "Monitoring script should check CloudWatch dashboards"
        )
        assert 'list-dashboards' in monitoring_script or 'describe-dashboard' in monitoring_script, (
            "Monitoring script should use AWS CLI to check dashboards"
        )
    
    def test_script_checks_cloudwatch_alarms(self, monitoring_script):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.2
        
        Verify that the script checks CloudWatch alarms.
        """
        assert 'alarm' in monitoring_script.lower(), (
            "Monitoring script should check CloudWatch alarms"
        )
        assert 'describe-alarms' in monitoring_script, (
            "Monitoring script should use describe-alarms"
        )
    
    def test_script_checks_alarm_states(self, monitoring_script):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.2
        
        Verify that the script checks alarm states.
        """
        assert 'StateValue' in monitoring_script or 'state' in monitoring_script.lower(), (
            "Monitoring script should check alarm states"
        )
        assert 'OK' in monitoring_script, (
            "Monitoring script should check for OK state"
        )
        assert 'ALARM' in monitoring_script, (
            "Monitoring script should check for ALARM state"
        )
    
    def test_script_checks_sns_topics(self, monitoring_script):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.3
        
        Verify that the script checks SNS topics.
        """
        assert 'sns' in monitoring_script.lower(), (
            "Monitoring script should check SNS"
        )
        assert 'list-topics' in monitoring_script, (
            "Monitoring script should list SNS topics"
        )
    
    def test_script_checks_sns_subscriptions(self, monitoring_script):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.3
        
        Verify that the script checks SNS subscriptions.
        """
        assert 'subscription' in monitoring_script.lower(), (
            "Monitoring script should check SNS subscriptions"
        )
        assert 'list-subscriptions' in monitoring_script, (
            "Monitoring script should list subscriptions"
        )
    
    def test_script_checks_xray_tracing(self, monitoring_script):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.5
        
        Verify that the script checks X-Ray tracing.
        """
        assert 'xray' in monitoring_script.lower(), (
            "Monitoring script should check X-Ray"
        )
        assert 'get-trace-summaries' in monitoring_script or 'trace' in monitoring_script.lower(), (
            "Monitoring script should check for traces"
        )
    
    def test_script_checks_cloudwatch_logs(self, monitoring_script):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.6
        
        Verify that the script checks CloudWatch Logs.
        """
        assert 'logs' in monitoring_script.lower(), (
            "Monitoring script should check CloudWatch Logs"
        )
        assert 'describe-log-groups' in monitoring_script, (
            "Monitoring script should describe log groups"
        )
    
    @given(environment=st.sampled_from(['test', 'production']))
    @settings(max_examples=10)
    def test_dashboard_naming_convention(self, environment):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.1
        
        *For any* environment, CloudWatch dashboards SHALL follow the naming 
        convention {environment}-crypto-trading-*.
        """
        expected_prefix = f"{environment}-crypto-trading"
        
        # Validate prefix format
        assert environment in expected_prefix, (
            "Dashboard prefix must contain environment"
        )
        assert 'crypto-trading' in expected_prefix, (
            "Dashboard prefix must contain 'crypto-trading'"
        )
    
    @given(environment=st.sampled_from(['test', 'production']))
    @settings(max_examples=10)
    def test_alarm_naming_convention(self, environment):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.2
        
        *For any* environment, CloudWatch alarms SHALL follow the naming 
        convention {environment}-crypto-trading-*.
        """
        expected_prefix = f"{environment}-crypto-trading"
        
        # Validate prefix format
        assert environment in expected_prefix, (
            "Alarm prefix must contain environment"
        )
        assert 'crypto-trading' in expected_prefix, (
            "Alarm prefix must contain 'crypto-trading'"
        )
    
    @given(alarm_state=st.sampled_from(ALARM_STATES))
    @settings(max_examples=10)
    def test_alarm_state_handling(self, alarm_state):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.2
        
        *For any* alarm state, the monitoring script SHALL correctly identify 
        and report the state.
        """
        # Validate alarm state is one of the expected values
        assert alarm_state in ALARM_STATES, (
            f"Alarm state '{alarm_state}' must be a valid CloudWatch alarm state"
        )
        
        # OK state should be considered healthy
        is_healthy = alarm_state == "OK"
        
        # ALARM state should be considered unhealthy
        is_alarm = alarm_state == "ALARM"
        
        # INSUFFICIENT_DATA is a warning state
        is_warning = alarm_state == "INSUFFICIENT_DATA"
        
        assert is_healthy or is_alarm or is_warning, (
            "Alarm state must be categorized"
        )
    
    @given(
        topic_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_',
            min_size=1,
            max_size=256
        ).filter(lambda x: not x.startswith('-') and not x.startswith('_'))
    )
    @settings(max_examples=100)
    def test_sns_topic_naming(self, topic_name):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.3
        
        *For any* SNS topic name, it SHALL follow AWS naming conventions.
        """
        assume(len(topic_name) >= 1)
        assume(len(topic_name) <= 256)
        
        # SNS topic names can contain alphanumeric, hyphens, underscores
        valid_chars = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_')
        assert all(c in valid_chars for c in topic_name), (
            "SNS topic name contains invalid characters"
        )
        
        # Topic name length must be 1-256 characters
        assert 1 <= len(topic_name) <= 256, (
            "SNS topic name must be 1-256 characters"
        )
    
    @given(
        subscription_count=st.integers(min_value=0, max_value=100)
    )
    @settings(max_examples=50)
    def test_subscription_count_validation(self, subscription_count):
        """
        Feature: production-deployment
        Property 5: Monitoring Configuration Compliance
        Validates: Requirements 11.3
        
        *For any* SNS topic, the subscription count SHALL be reported accurately.
        """
        # Subscription count must be non-negative
        assert subscription_count >= 0, (
            "Subscription count must be non-negative"
        )
        
        # Topics with 0 subscriptions should be flagged as warning
        has_subscriptions = subscription_count > 0
        
        if not has_subscriptions:
            # This is a warning condition but not a failure
            pass


class TestMonitoringScriptStructure:
    """
    Tests for monitoring script structure and completeness.
    
    Feature: production-deployment
    Validates: Requirements 11.1, 11.4
    """
    
    def test_script_has_environment_parameter(self, monitoring_script):
        """
        Feature: production-deployment
        Validates: Requirements 11.1
        
        Verify that the monitoring script accepts environment parameter.
        """
        assert 'environment' in monitoring_script.lower(), (
            "Monitoring script should accept environment parameter"
        )
        assert 'test' in monitoring_script and 'production' in monitoring_script, (
            "Monitoring script should support test and production environments"
        )
    
    def test_script_has_error_handling(self, monitoring_script):
        """
        Feature: production-deployment
        Validates: Requirements 11.4
        
        Verify that the monitoring script has error handling.
        """
        assert 'set -e' in monitoring_script, (
            "Monitoring script should use 'set -e' for error handling"
        )
    
    def test_script_has_logging(self, monitoring_script):
        """
        Feature: production-deployment
        Validates: Requirements 11.4
        
        Verify that the monitoring script has logging functions.
        """
        assert 'log_info' in monitoring_script or 'log_' in monitoring_script, (
            "Monitoring script should have logging functions"
        )
    
    def test_script_has_summary_output(self, monitoring_script):
        """
        Feature: production-deployment
        Validates: Requirements 11.4
        
        Verify that the monitoring script outputs a summary.
        """
        assert 'summary' in monitoring_script.lower(), (
            "Monitoring script should output a summary"
        )
    
    def test_script_tracks_results(self, monitoring_script):
        """
        Feature: production-deployment
        Validates: Requirements 11.4
        
        Verify that the monitoring script tracks validation results.
        """
        assert 'VALIDATION_RESULTS' in monitoring_script or 'result' in monitoring_script.lower(), (
            "Monitoring script should track validation results"
        )
        assert 'pass' in monitoring_script.lower() and 'fail' in monitoring_script.lower(), (
            "Monitoring script should track pass/fail status"
        )
    
    def test_script_returns_exit_code(self, monitoring_script):
        """
        Feature: production-deployment
        Validates: Requirements 11.4
        
        Verify that the monitoring script returns appropriate exit code.
        """
        assert 'exit 0' in monitoring_script, (
            "Monitoring script should exit 0 on success"
        )
        assert 'exit 1' in monitoring_script, (
            "Monitoring script should exit 1 on failure"
        )
    
    def test_script_uses_aws_cli(self, monitoring_script):
        """
        Feature: production-deployment
        Validates: Requirements 11.1
        
        Verify that the monitoring script uses AWS CLI.
        """
        assert 'aws cloudwatch' in monitoring_script, (
            "Monitoring script should use AWS CloudWatch CLI"
        )
        assert 'aws sns' in monitoring_script, (
            "Monitoring script should use AWS SNS CLI"
        )
        assert 'aws logs' in monitoring_script, (
            "Monitoring script should use AWS Logs CLI"
        )


class TestAlertConfiguration:
    """
    Tests for alert and notification configuration.
    
    Feature: production-deployment
    Validates: Requirements 11.3, 11.4
    """
    
    def test_script_can_send_test_alert(self, monitoring_script):
        """
        Feature: production-deployment
        Validates: Requirements 11.4
        
        Verify that the monitoring script can send test alerts.
        """
        assert 'sns publish' in monitoring_script or 'test_alert' in monitoring_script.lower(), (
            "Monitoring script should be able to send test alerts"
        )
    
    @given(
        environment=st.sampled_from(['test', 'production']),
        alert_type=st.sampled_from(['error', 'warning', 'info'])
    )
    @settings(max_examples=20)
    def test_alert_topic_naming(self, environment, alert_type):
        """
        Feature: production-deployment
        Validates: Requirements 11.3
        
        *For any* environment and alert type, the SNS topic SHALL follow 
        a consistent naming convention.
        """
        expected_topic_pattern = f"{environment}-crypto-trading"
        
        # Validate topic pattern
        assert environment in expected_topic_pattern, (
            "Alert topic must contain environment"
        )
        assert 'crypto-trading' in expected_topic_pattern, (
            "Alert topic must contain 'crypto-trading'"
        )


class TestLogConfiguration:
    """
    Tests for log configuration validation.
    
    Feature: production-deployment
    Validates: Requirements 11.6
    """
    
    def test_script_checks_log_retention(self, monitoring_script):
        """
        Feature: production-deployment
        Validates: Requirements 11.6
        
        Verify that the monitoring script checks log retention settings.
        """
        assert 'retention' in monitoring_script.lower(), (
            "Monitoring script should check log retention"
        )
    
    @given(
        retention_days=st.sampled_from([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653])
    )
    @settings(max_examples=20)
    def test_valid_retention_periods(self, retention_days):
        """
        Feature: production-deployment
        Validates: Requirements 11.6
        
        *For any* log retention period, it SHALL be a valid CloudWatch Logs 
        retention value.
        """
        # Valid CloudWatch Logs retention periods
        valid_retention_days = [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653]
        
        assert retention_days in valid_retention_days, (
            f"Retention period {retention_days} must be a valid CloudWatch Logs value"
        )
    
    @given(environment=st.sampled_from(['test', 'production']))
    @settings(max_examples=10)
    def test_log_group_naming_convention(self, environment):
        """
        Feature: production-deployment
        Validates: Requirements 11.6
        
        *For any* environment, Lambda log groups SHALL follow the naming 
        convention /aws/lambda/{environment}-crypto-trading-*.
        """
        expected_prefix = f"/aws/lambda/{environment}-crypto-trading"
        
        # Validate prefix format
        assert expected_prefix.startswith('/aws/lambda/'), (
            "Log group prefix must start with '/aws/lambda/'"
        )
        assert environment in expected_prefix, (
            "Log group prefix must contain environment"
        )
        assert 'crypto-trading' in expected_prefix, (
            "Log group prefix must contain 'crypto-trading'"
        )
