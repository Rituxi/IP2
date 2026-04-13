:globe_with_meridians: [中文简体](README_zh.md) | [English](README.md)

# nginx-ip2region

## build

```shell
$ mkdir -p workspace
$ cd workspace
$ wget https://nginx.org/download/nginx-1.23.6.tar.gz
$ tar -zxf nginx-1.23.6.tar.gz && rm -rf nginx-1.23.6.tar.gz
$ git clone https://github.com/lionsoul2014/ip2region.git
$ cd ip2region/binding/c
$ make xdb_searcher_lib
$ cd ../../../nginx-1.23.6
$ ./configure                                                            \
    --add-module=$(PWD)/../ip2region/binding/nginx                       \
    --with-cc-opt="-I $(PWD)/../ip2region/binding/c/build/include"       \
    --with-ld-opt="-L $(PWD)/../ip2region/binding/c/build/lib"
$ make
$ make install
```

## nginx conf

> Syntax:  `ip2region_db xdb_file_path [cache_policy Optional]`;
> Context: http

cache_policy: `file` or `vectorIndex` or `content`, default: `content`

Edit `nginx.conf` add `ip2region_db` directive

```nginx
...
http {

    log_format main escape=json '{'
                                '"remote_addr": "$remote_addr", '
                                '"region": "$ip2region", '
                                '"http_x_forwarded_for": "$http_x_forwarded_for"'
                                '}';

    access_log logs/access.log main;

    # set xdb file path
    ip2region_db ip2region.xdb;
    # ip2region_db ip2region.xdb vectorIndex;
    # ip2region_db ip2region.xdb file;
    # ip2region_db ip2region.xdb content;

    server {
        listen 80;
        server_name localhost;

        location / {
            root html;
            index index.html index.htm;
        }
    }
}

```

Copy `ip2region_v4.xdb` to `nginx/config` folder (rename name it to ip2region.xdb), then restart nginx, the `region` data stored in `ip2region` variable

nginx access log sample

```log
{"remote_addr": "127.0.0.1", "region": "Reserved|Reserved|Reserved|0|0", "http_x_forwarded_for": ""}
{"remote_addr": "127.0.0.1", "region": "Reserved|Reserved|Reserved|0|0", "http_x_forwarded_for": ""}
```

Additionally, you can build the nginx dynamic module using the Dockerfile in the current directory.

> * The [buildx](https://github.com/docker/buildx) plugin is required to enable export functionality.

```shell

docker build -t export_so -o type=tar,dest=./so.tar .
# The final result is a dynamic module named ngx_http_ip2region_module.so.
tar xf so.tar && rm so.tar

```

usage of dynamic modules

```

# nginx.conf
load_module /etc/nginx/my-modules/ngx_http_ip2region_module.so;

http {
    # ...
    ip2region_db /etc/nginx/conf.d/ip2region_v4.xdb content;
    ip2region_db6 /etc/nginx/conf.d/ip2region_v6.xdb content;
    # ...
}
```

