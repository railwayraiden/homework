--- <system>
# Task

Your task is to analyze the provided repo project, and adapt the project to be deployable to Railway, an infrastructure for deploying containers.

---

# Output Structure Format Example

```xml
<project>
<service name="PostgresDb" type="postgres"></service>
<service name="App" type="container">
<file path=".env">
SOME_ENV_KEY=VALUE_EXAMPLE
PG_DB_URL=${{PostgresDb.DATABASE_PUBLIC_URL}}
</file>
<file path="Dockerfile">
FROM ...
</file>
<file path="some/dir/file.ext">
...
</file>
</service>
</project>
```

- service type can either be :
  * if database : "postgres" "redis" "mysql"
  * if container (ie. app , api): "container"

- referring to variables in other service is via env keys , where values is set to :
    `OTHER_SERVICE_VARIABLE=${{serviceName.variableName}}`
- referring to services public domain (outside of db cases) , use
    `OTHER_SERVICE_URL=https://${{serviceName.RAILWAY_PUBLIC_DOMAIN}}`
---

# Requirements

# Railway + Dockerfile Setup

## Dockerfile
- Dockerfile needs to have an exposed $PORT (which is auto assigned) and use it
- Each service has one exposed port

## Railway Config

A container service needs to also have a railway configuration , in either of :

### Web app service case

If the service is a web app (ie. react project , ...), the service needs to have `Caddyfile` and `nixpacks.toml` files.

```Caddyfile
# global options
{
	admin off # theres no need for the admin api in railway's environment
	persist_config off # storage isn't persistent anyway
	auto_https off # railway handles https for us, this would cause issues if left enabled
	# runtime logs
	log {
		format json # set runtime log format to json mode 
	}
	# server options
	servers {
		trusted_proxies static private_ranges 100.0.0.0/8 # trust railway's proxy
	}
}

# site block, listens on the $PORT environment variable, automatically assigned by railway
:{$PORT:3000} {
	# access logs
	log {
		format json # set access log format to json mode
	}

	# health check for railway
	rewrite /health /*

	# serve from the 'dist' folder (Vite builds into the 'dist' folder)
	root * dist

	# enable gzipping responses
	encode gzip

	# serve files from 'dist'
	file_server

	# if path doesn't exist, redirect it to 'index.html' for client side routing
	try_files {path} /index.html
}
```

```nixpacks.toml
# https://nixpacks.com/docs/configuration/file

# set up some variables to minimize annoyance
[variables]
    NPM_CONFIG_UPDATE_NOTIFIER = 'false' # the update notification is relatively useless in a production environment
    NPM_CONFIG_FUND = 'false' # the fund notification is also pretty useless in a production environment

# download caddy from nix
[phases.caddy]
    dependsOn = ['setup'] # make sure this phase runs after the default 'setup' phase
    nixpkgsArchive = 'ba913eda2df8eb72147259189d55932012df6301' # Caddy v2.8.4 - https://github.com/NixOS/nixpkgs/commit/ba913eda2df8eb72147259189d55932012df6301
    nixPkgs = ['caddy'] # install caddy as a nix package

# format the Caddyfile with fmt
[phases.fmt]
    dependsOn = ['caddy'] # make sure this phase runs after the 'caddy' phase so that we know we have caddy downloaded
    cmds = ['caddy fmt --overwrite Caddyfile'] # format the Caddyfile to fix any formatting inconsistencies

# start the caddy web server
[start]
    cmd = 'exec caddy run --config Caddyfile --adapter caddyfile 2>&1' # start caddy using the Caddyfile config and caddyfile adapter
```

### Container case

Other than web apps , the container service needs to have a simple railway.json configuration, as follows

```railway.json
{
    "$schema": "https://railway.com/railway.schema.json",
    "build": {
        "builder": "DOCKERFILE",
        "dockerfilePath": "./Dockerfile"
    },
    "deploy": {
        "startCommand": "bun index.js",
        "restartPolicyType": "NEVER",
        "sleepApplication": true // <---- determines whether serverless or not , depending on the nature of the service
    }
}
```

---

# Container Entrypoint
## DB services variables

# DBs

- If a specific database external to the project is used, keep its configuration as should be.
- If the project requires the creation of a database, you have the option of creating a database service and using it. The 3 database options are:
  - redis : which (automatically) exposes env variable `REDIS_PUBLIC_URL` , which can be used to connect to the database from other container services.
  - mysql : which (automatically) exposes env variable `MYSQL_PUBLIC_URL` , which can be used to connect to the database from other container services.
  - postgres : which (automatically) exposes env variable `DATABASE_PUBLIC_URL` , which can be used to connect to the database from other container services.

---

# Examples

{{exampleRepos}}

---

# Important Notes

* Ensure XML formatting correctness without prepadding, trailing whitespaces, or indentation issues, especially crucial for code files (e.g., Python).
* Only write the file contents for the files that you need to either create or update (or rewrite in a different path). Do not duplicate files to put the same exact thing.
* Try to stay consistent with provided names if applies, even if it seems slightly counter intuitive.
* You can include an analysis before the ```xml``` part , to explain your reasoning and help yourself assess the situation better.

--- 
Answer in format ```xml``` exactly as specified in the structure.
Your provided project files will either override previous files , or create new files if not previously existent.
Your role is create the full changes that'd make the project deployable to Railway.

--- </system>

--- <user>

# Repo

```xml
{{project}}
```

---

Generate the reply adhering to the given format.

--- </user>