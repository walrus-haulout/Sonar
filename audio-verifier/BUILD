# Bazel BUILD file for sonar-audio-verifier
# This uses genrule to install Python packages using pip, leveraging Bazel's caching

# Install Python dependencies using pip
genrule(
    name = "dependencies",
    srcs = glob([
        "pyproject.toml",
        "*.py",
    ]),
    outs = ["deps-installed"],
    cmd = """
        python3.13 -m venv .venv && \
        . .venv/bin/activate && \
        pip install --upgrade pip && \
        pip install . && \
        touch $$(location deps-installed)
    """,
    message = "Installing Python dependencies with pip",
    local = 1,  # Run locally to preserve pip's caching
)

# Build the application package
genrule(
    name = "app",
    srcs = glob([
        "pyproject.toml",
        "*.py",
    ]),
    outs = ["app-installed"],
    tools = [":dependencies"],
    cmd = """
        python3.13 -m venv .venv && \
        . .venv/bin/activate && \
        pip install --upgrade pip && \
        pip install . && \
        touch $$(location app-installed)
    """,
    message = "Building application package",
    local = 1,
)

# Filegroup for the complete application
filegroup(
    name = "application",
    srcs = [
        ":app",
        ":dependencies",
    ],
)

