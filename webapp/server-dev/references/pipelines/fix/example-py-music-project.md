## Example : A project with a python app and a postgres database

### Input

```repo
<file path="requirements.txt">
flask
psycopg2-binary
</file>
<file path="app.py">
from flask import Flask, jsonify, render_template_string
import os
import psycopg2

local_postgres_db = "postgresql://postgres:postgres@localhost:5432/postgres"

app = Flask(__name__)
@app.route('/', methods=['GET'])
def get_albums():
    conn = None
    albums = []
    try:
        database_url = local_postgres_db
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT * FROM albums")
        albums = cur.fetchall()
        cur.close()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

    html = '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>Albums</title>
        <style>
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            tr:nth-child(even) { background-color: #f2f2f2; }
        </style>
    </head>
    <body style="font-family: monospace;">
        <h1>Albums</h1>
        <table>
            {% for album in albums %}
            <tr>
                {% for value in album %}
                <td>{{ value }}</td>
                {% endfor %}
            </tr>
            {% endfor %}
        </table>
    </body>
    </html>
    '''

    return render_template_string(html, albums=albums)

if __name__ == '__main__':
    port = int(os.getenv('PORT', 3000))
    app.run(host='0.0.0.0', port=port)

</file>
```

### Analysis

- The repo is a python flask app that connects to a local postgres database.

- The repo would require a postgres database to work in a cloud environment.
  Therefore, it would be a good idea to setup a postgres service in the project and link it.

- The repo does not seem to have a Dockerfile nor a railway.json file.
  Therefore, it would be a good idea to create a Dockerfile and a railway.json file, and expose the port from auto-assigned $PORT environment variable.

- The repo does not have a env file either, therefore it would be a good idea to create a .env file and add the required environment variables.

- The repo app code should be altered to use the environment variables instead of the local database url, and also use the environment variables for the port.

- requirements do not change so no need to specify a new requirements.txt

### Output

```xml
<project>
<service name="PostgresDb" type="postgres"></service>
<service name="ApiPy" type="container">
<file path=".env">
POSTGRES_DB_URL="${{PostgresDb.DATABASE_PUBLIC_URL}}" # refer to other services using : ${{serviceName.variableNameFromThatService}}
</file>
<file path="Dockerfile">
# Use an official Python runtime as a parent image
FROM python:3.10-slim

ARG SOME_KEY

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container
COPY . .

# Install the Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose the port the app runs on
EXPOSE $PORT

# Command to run the application
CMD ["python", "app.py"]
</file>
<file path="railway.json">
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "./Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "NEVER",
    "sleepApplication": true
  }
}
</file>
<file path="app.py">
from flask import Flask, jsonify, render_template_string
import os
import psycopg2

app = Flask(__name__)

@app.route('/', methods=['GET'])
def get_albums():
    conn = None
    albums = []
    try:
        database_url = os.getenv('POSTGRES_DB_URL', '')
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute("SELECT * FROM albums")
        albums = cur.fetchall()
        cur.close()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

    html = '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>Albums</title>
        <style>
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            tr:nth-child(even) { background-color: #f2f2f2; }
        </style>
    </head>
    <body style="font-family: monospace;">
        <h1>Albums</h1>
        <table>
            {% for album in albums %}
            <tr>
                {% for value in album %}
                <td>{{ value }}</td>
                {% endfor %}
            </tr>
            {% endfor %}
        </table>
    </body>
    </html>
    '''

    return render_template_string(html, albums=albums)

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    app.run(host='0.0.0.0', port=port)

</file>
</service>
</project>
```

As you can also see, since `requirements.txt` does not require updates, we did not have to specify the file content to avoid duplicating when no changes (no file creation / no file updates) are required.
