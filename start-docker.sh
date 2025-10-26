#!/bin/bash

# Script to start Docker containers for Payment Flow application
# Run this with: sudo ./start-docker.sh

echo "Starting Payment Flow Docker containers..."
docker compose up -d

echo ""
echo "Waiting for services to be healthy..."
sleep 10

echo ""
echo "Checking container status..."
docker compose ps

echo ""
echo "Services started!"
echo "- PostgreSQL: localhost:5432"
echo "- Redis: localhost:6379"
echo "- pgAdmin: http://localhost:5050"
echo ""
echo "To view logs: docker compose logs -f"
echo "To stop: docker compose down"
