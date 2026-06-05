from locust import HttpUser, between, task


class MarketDataUser(HttpUser):
    wait_time = between(0.1, 1.0)

    @task(5)
    def tickers(self):
        self.client.get("/api/v1/market/tickers")

    @task(3)
    def depth(self):
        self.client.get("/api/v1/market/depth/BTCUSDT?limit=100")

    @task(1)
    def health(self):
        self.client.get("/health")
