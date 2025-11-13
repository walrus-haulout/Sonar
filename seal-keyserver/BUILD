# Bazel BUILD file for seal-keyserver
# This uses genrule to call Cargo builds, leveraging Bazel's caching

# Build key-server binary using Cargo
genrule(
    name = "key-server",
    srcs = glob([
        "seal/**/*.rs",
        "seal/**/*.toml",
        "seal/Cargo.toml",
        "seal/Cargo.lock",
    ], exclude = ["seal/target/**"]),
    outs = ["key-server-bin"],
    cmd = """
        export CARGO_NET_GIT_FETCH_WITH_CLI=true && \
        cd seal && \
        cargo build --bin key-server --release --config net.git-fetch-with-cli=true && \
        cp target/release/key-server $$(location key-server-bin)
    """,
    message = "Building key-server binary",
    local = 1,  # Run locally to preserve Cargo's incremental compilation
)

# Build seal-cli binary using Cargo
genrule(
    name = "seal-cli",
    srcs = glob([
        "seal/**/*.rs",
        "seal/**/*.toml",
        "seal/Cargo.toml",
        "seal/Cargo.lock",
    ], exclude = ["seal/target/**"]),
    outs = ["seal-cli-bin"],
    cmd = """
        export CARGO_NET_GIT_FETCH_WITH_CLI=true && \
        cd seal && \
        cargo build --bin seal-cli --release --config net.git-fetch-with-cli=true && \
        cp target/release/seal-cli $$(location seal-cli-bin)
    """,
    message = "Building seal-cli binary",
    local = 1,  # Run locally to preserve Cargo's incremental compilation
)

# Combined build target for both binaries
filegroup(
    name = "binaries",
    srcs = [
        ":key-server",
        ":seal-cli",
    ],
)

