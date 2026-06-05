variable "environment" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "vpc_id" { type = string }

resource "aws_db_subnet_group" "this" {
  name       = "cex-${var.environment}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "db" {
  name   = "cex-${var.environment}-db"
  vpc_id = var.vpc_id
}

resource "aws_db_instance" "postgres" {
  identifier             = "cex-${var.environment}"
  engine                 = "postgres"
  engine_version         = "16.3"
  instance_class         = "db.t4g.medium"
  allocated_storage      = 100
  storage_encrypted      = true
  db_name                = "cex"
  username               = "cex_admin"
  manage_master_user_password = true
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  backup_retention_period = 7
  multi_az               = var.environment == "production"
  skip_final_snapshot    = var.environment != "production"
}
