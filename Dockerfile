FROM rackspacedot/python37:latest

CMD ["bash"]

# Install Node.js 8 and npm 5
RUN apt-get update
RUN apt-get -y install curl gnupg
RUN curl -sL https://deb.nodesource.com/setup_11.x  | bash -
RUN apt-get -y install nodejs
RUN apt install wget

COPY requirements.txt .
RUN pip install -r /requirements.txt
RUN pip install Pillow==6.2.2

RUN mkdir /workspace
WORKDIR /workspace
RUN mkdir /workspace/data

RUN wget 'https://drive.google.com/uc?id=1Jk4eGD7crsqCCg9C9VjCLkMN3ze8kutZ&export=download' -O /workspace/craft_mlt_25k.pth 
RUN wget 'https://drive.google.com/uc?id=1i2R7UIUqmkUtF0jv_3MXTqmQ_9wuAnLf&export=download' -O /workspace/craft_ic15_20k.pth 
RUN wget 'https://drive.google.com/uc?id=1XSaFwBkOaFOdtk4Ane3DFyJGPRw6v5bO&export=download' -O /workspace/craft_refiner_CTW1500.pth 

RUN apt-get install zip

COPY package.json .
RUN npm install

COPY test.py .
COPY server.js .

COPY . .
EXPOSE 80
ENTRYPOINT node server.js