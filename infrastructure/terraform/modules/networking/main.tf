variable "environment" { type = string }
variable "vpc_cidr" { type = string }

data "aws_availability_zones" "available" { state = "available" }

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  tags = { Name = "cex-${var.environment}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = { Name = "cex-${var.environment}-private-${count.index}" }
}

output "vpc_id" { value = aws_vpc.this.id }
output "private_subnet_ids" { value = aws_subnet.private[*].id }
