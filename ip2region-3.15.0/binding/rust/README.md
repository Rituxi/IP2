:globe_with_meridians: [中文简体](README_zh.md) | [English](README.md)

## `ip2region rust` Query Client

## Features

* Supports queries using both `ip` strings and `u32`/`u28` numeric types
* Supports IPv4 and IPv6
* Supports three modes: No Cache, Vector Index Cache, and Full Data Cache

## Cache Policy Comparison and Description

| Cache Mode | IPv4 Memory Usage | IPv6 Memory Usage | IPv4 benchmark query time | IPv6 benchmark query time |
| --- | --- | --- | --- | --- |
| No Cache | 1-2MB | 1-2MB | 54 us | 122us |
| vector index | 1-2MB | 1-2MB | 27 us | 100us |
| Full Cache | 20 MB | 200 MB | 120 ns | 178 ns |

* During the initialization of `ip2region::Searcher`, an IO operation occurs to read the `xdb` header information to initialize the `Searcher`. The header information mainly includes the IP version of the `xdb`. This operation does not affect the performance or time consumption of subsequent IP queries and occupies approximately 20 additional bytes of memory.
* In No Cache mode and `vector index` cache mode, all `xdb` IO reads are performed on-demand (based on bytes offset and bytes length) for small amounts of information. Both are thread-safe, as verified by benchmark testing.
* In Full Cache mode, the `xdb` file is read and loaded into memory at once. Testing shows the `IPv6 xdb` file occupies about 200MB of memory. If queries are infrequent, memory usage will gradually decrease.
* In all cache modes, including during the initialization of `ip2region::Searcher`, the program is thread-safe. There are no globally modifiable intermediate variables. After `ip2region::Searcher` initialization is complete, calling the `search` function uses immutable references. Meanwhile, `ip2region::Searcher` can also be passed to different threads using `Arc`.

## Usage

Create a new project using `cargo`, such as `cargo new ip-test`

Configure `[dependencies]` in `Cargo.toml` as follows:

```toml
[dependencies]
ip2region = { git = "https://github.com/lionsoul2014/ip2region.git", branch = "master" }

```

### Basic Usage Example

Write `main.rs`

```rust
use ip2region::{CachePolicy, Searcher};

fn main() {
    for cache_policy in [
        CachePolicy::NoCache,
        CachePolicy::FullMemory,
        CachePolicy::VectorIndex,
    ] {
        // Create an IPv4 searcher
        let ipv4_seacher = Searcher::new("../ip2region/data/ip2region_v4.xdb".to_owned(), cache_policy).unwrap();
        for ip in [1_u32, 2, 3] {
            let result = ipv4_seacher.search(ip).unwrap();
            println!("CachePolicy: {cache_policy:?}, IP: {ip}, Result: {result}");
        }

        for ip in ["1.1.1.1", "2.2.2.2"] {
            let result = ipv4_seacher.search(ip).unwrap();
            println!("CachePolicy: {cache_policy:?}, IP: {ip}, Result: {result}");
        }

        // Create an IPv6 searcher
        let ipv6_seacher = Searcher::new("../ip2region/data/ip2region_v6.xdb".to_owned(), cache_policy).unwrap();
        for ip in ["2001::", "2001:4:112::"] {
            let result = ipv6_seacher.search(ip).unwrap();
            println!("CachePolicy: {cache_policy:?}, IP: {ip}, Result: {result}");
        }

        for ip in [1_u128, 2, 3<<125] {
            let result = ipv6_seacher.search(ip).unwrap();
            println!("CachePolicy: {cache_policy:?}, IP: {ip}, Result: {result}");
        }
    }
}
```

## Cache policy benchmark

```bash
$ cd binding/rust/ip2region
$ cargo test
$ cargo bench

// --snip---
ipv4_no_memory_bench    time:   [54.699 µs 57.401 µs 61.062 µs]
Found 16 outliers among 100 measurements (16.00%)
  10 (10.00%) high mild
  6 (6.00%) high severe

ipv4_vector_index_cache_bench
                        time:   [25.972 µs 26.151 µs 26.360 µs]
Found 9 outliers among 100 measurements (9.00%)
  1 (1.00%) low severe
  6 (6.00%) high mild
  2 (2.00%) high severe

ipv4_full_memory_cache_bench
                        time:   [132.04 ns 139.48 ns 149.20 ns]
Found 10 outliers among 100 measurements (10.00%)
  4 (4.00%) high mild
  6 (6.00%) high severe

ipv6_no_memory_bench    time:   [121.00 µs 122.14 µs 123.40 µs]
Found 5 outliers among 100 measurements (5.00%)
  2 (2.00%) high mild
  3 (3.00%) high severe

ipv6_vector_index_cache_bench
                        time:   [96.830 µs 100.23 µs 104.81 µs]
Found 8 outliers among 100 measurements (8.00%)
  2 (2.00%) high mild
  6 (6.00%) high severe

ipv6_full_memory_cache_bench
                        time:   [175.29 ns 178.82 ns 183.77 ns]
Found 6 outliers among 100 measurements (6.00%)
  2 (2.00%) high mild
  4 (4.00%) high severe
// --snip--
```

## Testing, Result Verification, and Benchmark

```bash
$ cd binding/rust/example
$ cargo build -r
```

The location of the built executable is `binding/rust/target/release/searcher`

Testing IPv6 and IPv4 requires verifying query results against the contents of `ipv6_source.txt` and `ipv4_source.txt`.

**The query results shown here represent data at the current time; subsequent results may differ due to updates and corrections in the IP region segments of `ip_source.txt` and `xdb` binary data.**

#### Test IPv6

```bash
$ cd binding/rust
$ cargo build -r
$ ./target/release/searcher --xdb='../../data/ip2region_v6.xdb' query
ip2region xdb searcher test program, type `quit` or `Ctrl + c` to exit
ip2region>> ::
region: Ok(""), took: 79.651412ms
ip2region>> 240e:3b7:3273:51d0:cd38:8ae1:e3c0:b708
region: Ok("中国|广东省|深圳市|电信|CN"), took: 7.575µs
ip2region>> 2001::
region: Ok("0|0|Reserved|Reserved|Reserved"), took: 7.256µs
ip2region>> 2001:268:9a02:8888::
region: Ok("Japan|Aichi|Nagoya|KDDI CORPORATION|JP"), took: 7.921µs
ip2region>> 2a02:26f7:b408:a6c2::
region: Ok("United States|Virginia|Emporia|Akamai Technologies, Inc.|US"), took: 8.461µs
ip2region>> 2c99::
region: Ok("0|0|Reserved|Reserved|Reserved"), took: 5.33µs
```

#### Test IPv4

```bash
$ cd binding/rust
$ cargo build -r
$  ./target/release/searcher --xdb='../../data/ip2region_v4.xdb' query
ip2region xdb searcher test program, type `quit` or `Ctrl + c` to exit
ip2region>> 1.2.3.4
region: Ok("Australia|Queensland|Brisbane|0|AU"), took: 6.07µs
ip2region>> 1.1.2.1
region: Ok("中国|福建省|福州市|0|CN"), took: 5.653µs
ip2region>> 2.2.21.1
region: Ok("United States|Texas|0|Oracle Svenska AB|US"), took: 4.556µs
```

#### Benchmark and Result Verification

Test performance via the `searcher` program while comparing query results against `ip sources` files to check for errors.

```bash
$ cd binding/rust/example
$ cargo build -r
## Perform IPv4 bench test using data/ip2region_v4.xdb and data/ipv4_source.txt:
$ RUST_LOG=debug ../target/release/searcher --xdb='../../../data/ip2region_v4.xdb' bench '../../../data/ipv4_source.txt'
2025-09-24T07:02:07.840535Z DEBUG ip2region::searcher: Load xdb file with header header=Header { version: 3, index_policy: VectorIndex, create_time: 1757125456, start_index_ptr: 955933, end_index_ptr: 11042415, ip_version: V4, runtime_ptr_bytes: 4 }
2025-09-24T07:02:07.840894Z DEBUG ip2region::searcher: Load vector index cache
2025-09-24T07:02:07.840905Z DEBUG ip2region::searcher: Load full cache filepath="../../../data/ip2region_v4.xdb"
2025-09-24T07:02:08.409990Z  INFO searcher: Benchmark finished count=3404406 took=569.388667ms avg_took=167ns

## Perform IPv6 bench test using data/ip2region_v6.xdb and data/ipv6_source.txt:
$ RUST_LOG=debug ../target/release/searcher --xdb='../../../data/ip2region_v6.xdb' bench '../../../data/ipv6_source.txt'
2025-09-24T07:01:48.991835Z DEBUG ip2region::searcher: Load xdb file with header header=Header { version: 3, index_policy: VectorIndex, create_time: 1756970508, start_index_ptr: 6585371, end_index_ptr: 647078145, ip_version: V6, runtime_ptr_bytes: 4 }
2025-09-24T07:01:48.992557Z DEBUG ip2region::searcher: Load vector index cache
2025-09-24T07:01:48.992563Z DEBUG ip2region::searcher: Load full cache filepath="../../../data/ip2region_v6.xdb"
2025-09-24T07:01:59.775879Z  INFO searcher: Benchmark finished count=38335905 took=10.784124584s avg_took=281ns
```
