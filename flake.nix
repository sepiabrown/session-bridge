{
  description = "Session Bridge development and OpenCode plugin setup environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      packagesFor = system: import nixpkgs { inherit system; };
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = packagesFor system;
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              bun
              git
              nodejs_22
            ];
          };
        }
      );

      formatter = forAllSystems (system: (packagesFor system).nixfmt-rfc-style);
    };
}
