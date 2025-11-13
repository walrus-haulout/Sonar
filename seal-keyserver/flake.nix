{
  description = "SEAL Key Server development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };
        
        # Use Rust 1.83.0 (matching the project requirements)
        rustToolchain = pkgs.rust-bin.stable."1.83.0".default.override {
          extensions = [ "rust-src" "rustfmt" "clippy" ];
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Rust toolchain
            rustToolchain
            
            # System dependencies for building Rust crates
            openssl
            pkg-config
            libpq
            python3
            socat
            curl
            
            # Build tools
            cargo
            rustc
            
            # Optional: Bazel for build orchestration
            bazel_7
            
            # Git (needed for Cargo git dependencies)
            git
          ];

          # Set environment variables for Cargo
          CARGO_NET_GIT_FETCH_WITH_CLI = "true";
          
          # Set up library paths for linking
          LD_LIBRARY_PATH = with pkgs; lib.makeLibraryPath [
            openssl
            libpq
          ];
          
          shellHook = ''
            echo "🔧 SEAL Key Server development environment"
            echo "Rust version: $(rustc --version)"
            echo "Cargo version: $(cargo --version)"
            echo ""
            echo "Available commands:"
            echo "  cargo build --bin key-server --release"
            echo "  cargo build --bin seal-cli --release"
            echo "  bazel build //:binaries"
          '';
        };

        # Build outputs
        packages.default = pkgs.stdenv.mkDerivation {
          name = "seal-keyserver";
          src = ./.;
          
          buildInputs = with pkgs; [
            rustToolchain
            openssl
            pkg-config
            libpq
            git
          ];
          
          CARGO_NET_GIT_FETCH_WITH_CLI = "true";
          
          buildPhase = ''
            cd seal
            cargo build --bin key-server --release --config net.git-fetch-with-cli=true
            cargo build --bin seal-cli --release --config net.git-fetch-with-cli=true
          '';
          
          installPhase = ''
            mkdir -p $out/bin
            cp seal/target/release/key-server $out/bin/
            cp seal/target/release/seal-cli $out/bin/
          '';
        };
      }
    );
}

