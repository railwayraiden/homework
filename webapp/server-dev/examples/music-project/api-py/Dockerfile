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