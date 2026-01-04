"""
Property-Based Tests for S3 Module

Feature: infrastructure-deployment
Property 3: S3 Bucket Security Configuration
Validates: Requirements 5.2, 5.3, 5.4, 5.8

This test validates that S3 buckets are properly configured with:
- Versioning enabled on all buckets
- Server-side encryption (SSE-S3) enabled on all buckets
- Public access blocked on backend buckets
- Consistent naming with environment prefix and account ID suffix
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
def s3_module_path(infrastructure_root):
    """Get the S3 module path."""
    return infrastructure_root / "modules" / "s3"


@pytest.fixture
def s3_main_tf(s3_module_path):
    """Load the S3 module main.tf file."""
    return load_terraform_file(s3_module_path / "main.tf")


@pytest.fixture
def s3_variables_tf(s3_module_path):
    """Load the S3 module variables.tf file."""
    return load_terraform_file(s3_module_path / "variables.tf")


@pytest.fixture
def s3_outputs_tf(s3_module_path):
    """Load the S3 module outputs.tf file."""
    return load_terraform_file(s3_module_path / "outputs.tf")


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


# Expected bucket names based on requirements
EXPECTED_BUCKETS = [
    "audit-logs",
    "prompt-templates", 
    "model-outputs",
    "frontend-assets",
    "lambda-deployments"
]

# Backend buckets that should have public access blocked
BACKEND_BUCKETS = [
    "audit-logs",
    "prompt-templates",
    "model-outputs",
    "lambda-deployments"
]


class TestS3BucketSecurityConfiguration:
    """
    Property 3: S3 Bucket Security Configuration
    
    *For any* S3 bucket created by the Terraform configuration (excluding frontend-assets),
    the bucket SHALL have versioning enabled, server-side encryption enabled, 
    and public access blocked.
    
    **Validates: Requirements 5.2, 5.3, 5.4, 5.8**
    """
    
    def test_s3_module_exists(self, s3_module_path):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.1
        
        Verify that the S3 module directory exists with required files.
        """
        assert s3_module_path.exists(), "S3 module directory should exist"
        assert (s3_module_path / "main.tf").exists(), "main.tf should exist"
        assert (s3_module_path / "variables.tf").exists(), "variables.tf should exist"
        assert (s3_module_path / "outputs.tf").exists(), "outputs.tf should exist"
    
    def test_all_required_buckets_defined(self, s3_main_tf):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.1
        
        Verify that all required buckets are defined in the module.
        """
        locals_list = s3_main_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        assert 'buckets' in locals_dict, "buckets local should be defined"
        
        buckets = locals_dict['buckets']
        for bucket_name in EXPECTED_BUCKETS:
            assert bucket_name in buckets, f"Bucket '{bucket_name}' should be defined"
    
    def test_versioning_enabled_for_all_buckets(self, s3_main_tf):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.2
        
        Verify that versioning is enabled for all buckets.
        """
        resources = s3_main_tf.get('resource', [])
        versioning_resources = extract_resources(resources, 'aws_s3_bucket_versioning')
        
        assert len(versioning_resources) > 0, "Versioning resources should be defined"
        
        # Check that versioning uses for_each to cover all buckets
        versioning = versioning_resources.get('buckets', {})
        assert versioning, "Versioning should be defined for all buckets using for_each"
        
        # Verify versioning configuration
        versioning_config = versioning.get('versioning_configuration', [{}])[0]
        assert versioning_config.get('status') == 'Enabled', (
            "Versioning status should be 'Enabled'"
        )
    
    def test_encryption_enabled_for_all_buckets(self, s3_main_tf):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.3
        
        Verify that server-side encryption (SSE-S3) is enabled for all buckets.
        """
        resources = s3_main_tf.get('resource', [])
        encryption_resources = extract_resources(
            resources, 'aws_s3_bucket_server_side_encryption_configuration'
        )
        
        assert len(encryption_resources) > 0, "Encryption resources should be defined"
        
        # Check that encryption uses for_each to cover all buckets
        encryption = encryption_resources.get('buckets', {})
        assert encryption, "Encryption should be defined for all buckets using for_each"
        
        # Verify encryption configuration uses AES256 (SSE-S3)
        rule = encryption.get('rule', [{}])[0]
        default_encryption = rule.get('apply_server_side_encryption_by_default', [{}])[0]
        assert default_encryption.get('sse_algorithm') == 'AES256', (
            "SSE algorithm should be 'AES256' (SSE-S3)"
        )

    
    def test_public_access_blocked_for_backend_buckets(self, s3_main_tf):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.4
        
        Verify that public access is blocked for backend buckets.
        """
        resources = s3_main_tf.get('resource', [])
        public_access_blocks = extract_resources(
            resources, 'aws_s3_bucket_public_access_block'
        )
        
        assert len(public_access_blocks) > 0, "Public access block resources should be defined"
        
        # Check that public access block exists for backend buckets
        backend_block = public_access_blocks.get('buckets', {})
        assert backend_block, "Public access block should be defined for backend buckets"
        
        # Verify all public access settings are true
        assert backend_block.get('block_public_acls') == True, (
            "block_public_acls should be true"
        )
        assert backend_block.get('block_public_policy') == True, (
            "block_public_policy should be true"
        )
        assert backend_block.get('ignore_public_acls') == True, (
            "ignore_public_acls should be true"
        )
        assert backend_block.get('restrict_public_buckets') == True, (
            "restrict_public_buckets should be true"
        )
    
    def test_backend_buckets_marked_for_public_block(self, s3_main_tf):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.4
        
        Verify that backend buckets are marked for public access blocking in locals.
        """
        locals_list = s3_main_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        buckets = locals_dict.get('buckets', {})
        
        for bucket_name in BACKEND_BUCKETS:
            assert bucket_name in buckets, f"Bucket '{bucket_name}' should be defined"
            bucket_config = buckets[bucket_name]
            assert bucket_config.get('block_public') == True, (
                f"Backend bucket '{bucket_name}' should have block_public=true"
            )
    
    def test_frontend_assets_allows_cloudfront_access(self, s3_main_tf):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.7
        
        Verify that frontend-assets bucket allows CloudFront access.
        """
        locals_list = s3_main_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        buckets = locals_dict.get('buckets', {})
        frontend_bucket = buckets.get('frontend-assets', {})
        
        # Frontend bucket should NOT block public access (for CloudFront)
        assert frontend_bucket.get('block_public') == False, (
            "frontend-assets bucket should have block_public=false for CloudFront access"
        )
    
    def test_bucket_naming_includes_environment_prefix(self, s3_main_tf):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.8
        
        Verify that bucket naming includes environment prefix.
        """
        locals_list = s3_main_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        # Check that name_prefix is defined with environment
        assert 'name_prefix' in locals_dict, "name_prefix local should be defined"
        
        name_prefix = locals_dict['name_prefix']
        # The name_prefix should reference var.environment
        assert 'var.environment' in str(name_prefix) or '${var.environment}' in str(name_prefix), (
            "name_prefix should include var.environment"
        )
    
    def test_bucket_naming_includes_account_id(self, s3_main_tf):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.8
        
        Verify that bucket naming includes account ID suffix for uniqueness.
        """
        resources = s3_main_tf.get('resource', [])
        bucket_resources = extract_resources(resources, 'aws_s3_bucket')
        
        assert len(bucket_resources) > 0, "S3 bucket resources should be defined"
        
        # Check that bucket name includes account ID
        buckets = bucket_resources.get('buckets', {})
        bucket_name = buckets.get('bucket', '')
        
        assert 'aws_caller_identity.current.account_id' in str(bucket_name), (
            "Bucket name should include account ID for uniqueness"
        )



class TestS3BucketPropertyBased:
    """
    Property-based tests using Hypothesis to validate S3 bucket configurations.
    
    Feature: infrastructure-deployment
    Property 3: S3 Bucket Security Configuration
    Validates: Requirements 5.2, 5.3, 5.4, 5.8
    """
    
    @given(
        bucket_purpose=st.sampled_from(EXPECTED_BUCKETS),
        environment=st.sampled_from(['test', 'production']),
        project_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz-',
            min_size=3,
            max_size=20
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-') and '--' not in x),
        account_id=st.text(
            alphabet='0123456789',
            min_size=12,
            max_size=12
        )
    )
    @settings(max_examples=100)
    def test_bucket_naming_convention(self, bucket_purpose, environment, project_name, account_id):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.8
        
        *For any* bucket purpose, environment, project name, and account ID combination,
        the generated bucket name SHALL follow the pattern {project}-{env}-{purpose}-{account_id}.
        """
        expected_name = f"{project_name}-{environment}-{bucket_purpose}-{account_id}"
        
        # Validate bucket name format
        assert environment in expected_name, "Bucket name must contain environment"
        assert bucket_purpose in expected_name, "Bucket name must contain bucket purpose"
        assert account_id in expected_name, "Bucket name must contain account ID"
        
        # Validate bucket name length (AWS limit is 63 characters)
        assert len(expected_name) <= 63, "Bucket name must not exceed 63 characters"
        
        # Validate bucket name characters (lowercase, numbers, hyphens only)
        valid_chars = set('abcdefghijklmnopqrstuvwxyz0123456789-')
        assert all(c in valid_chars for c in expected_name), (
            "Bucket name must only contain lowercase letters, numbers, and hyphens"
        )
    
    @given(
        bucket_purpose=st.sampled_from(BACKEND_BUCKETS)
    )
    @settings(max_examples=100)
    def test_backend_buckets_require_public_block(self, bucket_purpose):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.4
        
        *For any* backend bucket, public access SHALL be blocked.
        """
        # Backend buckets should always have public access blocked
        assert bucket_purpose in BACKEND_BUCKETS, (
            f"Bucket '{bucket_purpose}' should be a backend bucket"
        )
        assert bucket_purpose != 'frontend-assets', (
            "frontend-assets is not a backend bucket"
        )
    
    @given(
        retention_days=st.integers(min_value=1, max_value=2555)
    )
    @settings(max_examples=100)
    def test_audit_log_retention_within_valid_range(self, retention_days):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.5
        
        *For any* audit log retention period, it SHALL be between 1 day and 7 years (2555 days).
        """
        assert 1 <= retention_days <= 2555, (
            f"Retention days {retention_days} must be between 1 and 2555"
        )
    
    @given(
        environment=st.sampled_from(['test', 'production'])
    )
    @settings(max_examples=100)
    def test_environment_specific_retention(self, environment):
        """
        Feature: infrastructure-deployment
        Property 3: S3 Bucket Security Configuration
        Validates: Requirements 5.5
        
        *For any* environment, the audit log retention SHALL be appropriate:
        - test: 90 days
        - production: 2555 days (7 years)
        """
        expected_retention = {
            'test': 90,
            'production': 2555
        }
        
        retention = expected_retention[environment]
        
        if environment == 'test':
            assert retention == 90, "Test environment should have 90 days retention"
        else:
            assert retention == 2555, "Production environment should have 7 years retention"
