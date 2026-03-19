// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "tauri-plugin-nativeaudio",
    platforms: [
        .iOS(.v14),
    ],
    products: [
        .library(
            name: "tauri-plugin-nativeaudio",
            type: .static,
            targets: ["tauri-plugin-nativeaudio"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-nativeaudio",
            dependencies: [
                .product(name: "Tauri", package: "Tauri"),
            ],
            path: "Sources")
    ]
)
