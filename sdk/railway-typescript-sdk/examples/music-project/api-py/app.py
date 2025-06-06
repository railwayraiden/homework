from flask import Flask, jsonify, render_template_string
import os
import psycopg2

app = Flask(__name__)

@app.route('/ping', methods=['GET'])
def ping():
    some_key = os.getenv('SOME_KEY', 'default_key')
    return jsonify({"message": f"pong : {some_key}"}), 200

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
    port = int(os.getenv('PORT', 3000))
    app.run(host='0.0.0.0', port=port)
