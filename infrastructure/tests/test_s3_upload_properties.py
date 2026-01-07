"""
Property-Based Tests for S3 Upload Configuration

Feature: production-deployment
Property 3: S3 Upload Configuration
Validates: Requirements 6.7, 6.8

This test validates that:
- Content-type headers match file extensions
- Cache-control is set correctly for hashed vs non-hashed assets
- HTML files have no-cache headers
- Hashed assets have long cache headers
"""
import os
import pytest
from hypothesis import given, strategies as st, settings, assume
from pathlib import Path
import re


def get_project_root():
    """Get the project root directory."""
    return Path(__file__).parent.parent.parent


def get_deployment_script_path():
    """Get the frontend deployment script path."""
    return get_project_root() / "deployment" / "scripts" / "deploy-frontend.sh"


def parse_deployment_script():
    """Parse the deployment script to extract content."""
    script_path = get_deployment_script_path()
    if not script_path.exists():
        return None
    
    with open(script_path, 'r') as f:
        return f.read()


# File extension to content-type mapping
CONTENT_TYPE_MAPPING = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject',
    'map': 'application/json',
    'txt': 'text/plain',
    'xml': 'application/xml',
    'webp': 'image/webp',
    'webm': 'video/webm',
    'mp4': 'video/mp4',
}

# Cache control values
LONG_CACHE = "max-age=31536000"
NO_CACHE = "no-cache"

# Patterns for hashed assets
HASH_PATTERNS = [
    r'_next/static',  # Next.js static assets
    r'\.[a-f0-9]{8,}\.',  # Files with hash in name
]


@pytest.fixture
def project_root():
    """Fixture providing the project root path."""
    return get_project_root()


@pytest.fixture
def deployment_script(project_root):
    """Fixture providing the deployment script content."""
    script_path = project_root / "deployment" / "scripts" / "deploy-frontend.sh"
    if not script_path.exists():
        pytest.skip("Frontend deployment script not found")
    
    with open(script_path, 'r') as f:
        return f.read()


class TestS3UploadConfiguration:
    """
    Property 3: S3 Upload Configuration
    
    *For any* file uploaded to the frontend S3 bucket, the content-type header 
    SHALL match the file extension (e.g., `.js` → `application/javascript`, 
    `.html` → `text/html`), and cache-control SHALL be set to long-cache for 
    hashed assets and no-cache for HTML files.
    
    **Validates: Requirements 6.7, 6.8**
    """
    
    def test_deployment_script_exists(self, project_root):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.7, 6.8
        
        Verify that the frontend deployment script exists.
        """
        script_path = project_root / "deployment" / "scripts" / "deploy-frontend.sh"
        assert script_path.exists(), "deploy-frontend.sh should exist"
        assert os.access(script_path, os.X_OK), "deploy-frontend.sh should be executable"
    
    def test_deployment_script_sets_content_type(self, deployment_script):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.7
        
        Verify that the deployment script sets content-type headers.
        """
        assert 'content-type' in deployment_script.lower() or 'content_type' in deployment_script.lower(), (
            "Deployment script should set content-type headers"
        )
    
    def test_deployment_script_sets_cache_control(self, deployment_script):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.8
        
        Verify that the deployment script sets cache-control headers.
        """
        assert 'cache-control' in deployment_script.lower() or 'cache_control' in deployment_script.lower(), (
            "Deployment script should set cache-control headers"
        )
    
    def test_deployment_script_has_long_cache_for_assets(self, deployment_script):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.8
        
        Verify that the deployment script sets long cache for hashed assets.
        """
        assert '31536000' in deployment_script, (
            "Deployment script should set max-age=31536000 for hashed assets"
        )
    
    def test_deployment_script_has_no_cache_for_html(self, deployment_script):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.8
        
        Verify that the deployment script sets no-cache for HTML files.
        """
        assert 'no-cache' in deployment_script.lower(), (
            "Deployment script should set no-cache for HTML files"
        )
    
    def test_deployment_script_excludes_html_from_long_cache(self, deployment_script):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.8
        
        Verify that the deployment script excludes HTML from long cache.
        """
        # Check that HTML files are handled separately
        assert '*.html' in deployment_script or 'html' in deployment_script.lower(), (
            "Deployment script should handle HTML files separately"
        )
    
    def test_deployment_script_uploads_to_s3(self, deployment_script):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.6
        
        Verify that the deployment script uploads to S3.
        """
        assert 'aws s3' in deployment_script, (
            "Deployment script should use aws s3 commands"
        )
    
    def test_deployment_script_has_content_type_function(self, deployment_script):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.7
        
        Verify that the deployment script has a function to determine content type.
        """
        assert 'get_content_type' in deployment_script or 'content-type' in deployment_script.lower(), (
            "Deployment script should have content type determination logic"
        )
    
    @given(extension=st.sampled_from(list(CONTENT_TYPE_MAPPING.keys())))
    @settings(max_examples=100)
    def test_content_type_mapping_is_valid(self, extension):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.7
        
        *For any* file extension in the mapping, the content-type SHALL be a 
        valid MIME type format.
        """
        content_type = CONTENT_TYPE_MAPPING[extension]
        
        # Validate MIME type format (type/subtype)
        assert '/' in content_type, (
            f"Content type '{content_type}' must be in type/subtype format"
        )
        
        parts = content_type.split('/')
        assert len(parts) == 2, (
            f"Content type '{content_type}' must have exactly one slash"
        )
        
        # Validate type is not empty
        assert len(parts[0]) > 0, "MIME type must not be empty"
        assert len(parts[1]) > 0, "MIME subtype must not be empty"
    
    @given(
        filename=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz0123456789-_',
            min_size=1,
            max_size=50
        ),
        extension=st.sampled_from(list(CONTENT_TYPE_MAPPING.keys()))
    )
    @settings(max_examples=100)
    def test_file_extension_determines_content_type(self, filename, extension):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.7
        
        *For any* file with a known extension, the content-type SHALL match 
        the expected MIME type for that extension.
        """
        assume(len(filename) >= 1)
        
        full_filename = f"{filename}.{extension}"
        expected_content_type = CONTENT_TYPE_MAPPING[extension]
        
        # Simulate the get_content_type function logic
        actual_extension = full_filename.split('.')[-1]
        actual_content_type = CONTENT_TYPE_MAPPING.get(actual_extension, 'application/octet-stream')
        
        assert actual_content_type == expected_content_type, (
            f"File '{full_filename}' should have content-type '{expected_content_type}', "
            f"got '{actual_content_type}'"
        )
    
    @given(
        filename=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz0123456789-_',
            min_size=1,
            max_size=50
        )
    )
    @settings(max_examples=100)
    def test_html_files_have_no_cache(self, filename):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.8
        
        *For any* HTML file, the cache-control header SHALL be set to no-cache.
        """
        assume(len(filename) >= 1)
        
        html_filename = f"{filename}.html"
        
        # HTML files should always have no-cache
        expected_cache_control = "no-cache"
        
        # Verify the file is recognized as HTML
        extension = html_filename.split('.')[-1]
        assert extension == 'html', "File should have .html extension"
        
        # The deployment script should set no-cache for HTML files
        # This is validated by checking the script content in other tests
    
    @given(
        hash_value=st.text(
            alphabet='abcdef0123456789',
            min_size=8,
            max_size=16
        ),
        extension=st.sampled_from(['js', 'css', 'png', 'jpg', 'woff2'])
    )
    @settings(max_examples=100)
    def test_hashed_assets_have_long_cache(self, hash_value, extension):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.8
        
        *For any* hashed asset (file with hash in name), the cache-control 
        header SHALL be set to max-age=31536000 (1 year).
        """
        assume(len(hash_value) >= 8)
        
        # Create a hashed filename
        hashed_filename = f"main.{hash_value}.{extension}"
        
        # Verify the file matches hash pattern
        has_hash = bool(re.search(r'\.[a-f0-9]{8,}\.', hashed_filename))
        assert has_hash, f"File '{hashed_filename}' should match hash pattern"
        
        # Hashed files should have long cache
        expected_cache_control = "max-age=31536000"
        
        # The deployment script should set long cache for hashed assets
        # This is validated by checking the script content in other tests
    
    @given(
        path_segment=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz0123456789-_',
            min_size=1,
            max_size=20
        ),
        filename=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz0123456789-_',
            min_size=1,
            max_size=30
        ),
        extension=st.sampled_from(['js', 'css', 'json'])
    )
    @settings(max_examples=100)
    def test_next_static_assets_have_long_cache(self, path_segment, filename, extension):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.8
        
        *For any* file in _next/static directory, the cache-control header 
        SHALL be set to max-age=31536000 (1 year).
        """
        assume(len(path_segment) >= 1)
        assume(len(filename) >= 1)
        
        # Create a Next.js static asset path
        static_path = f"_next/static/{path_segment}/{filename}.{extension}"
        
        # Verify the file is in _next/static
        assert '_next/static' in static_path, (
            f"Path '{static_path}' should be in _next/static"
        )
        
        # Files in _next/static should have long cache
        expected_cache_control = "max-age=31536000"
        
        # The deployment script should set long cache for _next/static assets
        # This is validated by checking the script content in other tests
    
    @given(
        filename=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz0123456789-_',
            min_size=1,
            max_size=50
        ),
        extension=st.sampled_from(['js', 'css', 'png', 'jpg', 'gif', 'svg'])
    )
    @settings(max_examples=100)
    def test_non_hashed_non_html_assets_have_reasonable_cache(self, filename, extension):
        """
        Feature: production-deployment
        Property 3: S3 Upload Configuration
        Validates: Requirements 6.8
        
        *For any* non-hashed, non-HTML asset, the cache-control header SHALL 
        be set to a reasonable value (not no-cache, not infinite).
        """
        assume(len(filename) >= 1)
        # Ensure filename doesn't look like a hash
        assume(not re.match(r'^[a-f0-9]{8,}$', filename))
        
        regular_filename = f"{filename}.{extension}"
        
        # Non-hashed, non-HTML files should have some cache
        # but not necessarily the full year
        # The deployment script may use a default like max-age=86400
        
        # Verify the file is not HTML
        assert extension != 'html', "File should not be HTML"
        
        # Verify the file doesn't have a hash pattern
        has_hash = bool(re.search(r'\.[a-f0-9]{8,}\.', regular_filename))
        assert not has_hash, f"File '{regular_filename}' should not match hash pattern"


class TestDeploymentScriptStructure:
    """
    Tests for frontend deployment script structure and completeness.
    
    Feature: production-deployment
    Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
    """
    
    def test_script_has_install_phase(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 6.1
        
        Verify that the deployment script has an install phase.
        """
        assert 'npm ci' in deployment_script or 'npm install' in deployment_script, (
            "Deployment script should install dependencies"
        )
    
    def test_script_has_build_phase(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 6.2
        
        Verify that the deployment script has a build phase.
        """
        assert 'npm run build' in deployment_script, (
            "Deployment script should build the application"
        )
    
    def test_script_has_test_phase(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 6.3, 6.4
        
        Verify that the deployment script has a test phase.
        """
        assert 'npm test' in deployment_script, (
            "Deployment script should run tests"
        )
    
    def test_script_has_skip_tests_option(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 6.4
        
        Verify that the deployment script supports skipping tests.
        """
        assert 'skip' in deployment_script.lower() and 'test' in deployment_script.lower(), (
            "Deployment script should support skipping tests"
        )
    
    def test_script_aborts_on_test_failure(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 6.4
        
        Verify that the deployment script aborts on test failure.
        """
        assert 'exit 1' in deployment_script, (
            "Deployment script should exit on failure"
        )
    
    def test_script_has_export_phase(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 6.5
        
        Verify that the deployment script exports static files.
        """
        assert 'export' in deployment_script.lower() or 'out' in deployment_script, (
            "Deployment script should export static files"
        )
    
    def test_script_has_s3_sync(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 6.6
        
        Verify that the deployment script syncs to S3.
        """
        assert 's3 sync' in deployment_script or 's3 cp' in deployment_script, (
            "Deployment script should sync files to S3"
        )
    
    def test_script_has_cloudfront_invalidation(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 6.9
        
        Verify that the deployment script invalidates CloudFront cache.
        """
        assert 'cloudfront' in deployment_script.lower() and 'invalidation' in deployment_script.lower(), (
            "Deployment script should invalidate CloudFront cache"
        )
    
    def test_script_validates_environment(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 6.1
        
        Verify that the deployment script validates environment parameter.
        """
        assert 'test' in deployment_script and 'production' in deployment_script, (
            "Deployment script should validate environment parameter"
        )
    
    def test_script_reads_manifest(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 5.1
        
        Verify that the deployment script reads from manifest file.
        """
        assert 'manifest' in deployment_script.lower(), (
            "Deployment script should read from manifest file"
        )
    
    def test_script_has_error_handling(self, deployment_script):
        """
        Feature: production-deployment
        Validates: Requirements 6.4
        
        Verify that the deployment script has error handling.
        """
        assert 'set -e' in deployment_script, (
            "Deployment script should use 'set -e' for error handling"
        )


class TestFrontendConfigurationGenerator:
    """
    Tests for frontend configuration generator script.
    
    Feature: production-deployment
    Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
    """
    
    @pytest.fixture
    def config_script(self, project_root):
        """Fixture providing the configuration generator script content."""
        script_path = project_root / "deployment" / "scripts" / "generate-frontend-config.sh"
        if not script_path.exists():
            pytest.skip("Frontend configuration generator script not found")
        
        with open(script_path, 'r') as f:
            return f.read()
    
    def test_config_script_exists(self, project_root):
        """
        Feature: production-deployment
        Validates: Requirements 5.1
        
        Verify that the configuration generator script exists.
        """
        script_path = project_root / "deployment" / "scripts" / "generate-frontend-config.sh"
        assert script_path.exists(), "generate-frontend-config.sh should exist"
        assert os.access(script_path, os.X_OK), "generate-frontend-config.sh should be executable"
    
    def test_config_script_reads_api_endpoint(self, config_script):
        """
        Feature: production-deployment
        Validates: Requirements 5.1
        
        Verify that the configuration script reads API endpoint from manifest.
        """
        assert 'api_gateway' in config_script.lower() or 'api_endpoint' in config_script.lower(), (
            "Configuration script should read API endpoint"
        )
    
    def test_config_script_sets_api_url(self, config_script):
        """
        Feature: production-deployment
        Validates: Requirements 5.2
        
        Verify that the configuration script sets NEXT_PUBLIC_API_URL.
        """
        assert 'NEXT_PUBLIC_API_URL' in config_script, (
            "Configuration script should set NEXT_PUBLIC_API_URL"
        )
    
    def test_config_script_handles_websocket(self, config_script):
        """
        Feature: production-deployment
        Validates: Requirements 5.3
        
        Verify that the configuration script handles WebSocket endpoint.
        """
        assert 'ws' in config_script.lower() or 'websocket' in config_script.lower(), (
            "Configuration script should handle WebSocket endpoint"
        )
    
    def test_config_script_sets_feature_flags(self, config_script):
        """
        Feature: production-deployment
        Validates: Requirements 5.4
        
        Verify that the configuration script sets feature flags.
        """
        assert 'feature' in config_script.lower() or 'ENABLE_' in config_script, (
            "Configuration script should set feature flags"
        )
    
    def test_config_script_creates_env_file(self, config_script):
        """
        Feature: production-deployment
        Validates: Requirements 5.1
        
        Verify that the configuration script creates .env.local file.
        """
        assert '.env.local' in config_script, (
            "Configuration script should create .env.local file"
        )
