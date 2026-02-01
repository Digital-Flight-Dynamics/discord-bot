FROM node:18

# Set the working directory in the container
WORKDIR /bot

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Build the application
RUN npm run build

# EXPOSE XXXX

# Start the application
CMD ["npm", "start"]
