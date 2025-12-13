FROM alpine:3.21

RUN apk add --no-cache bash postgresql-client tar gzip coreutils

COPY deploy/backup/backup-once.sh /usr/local/bin/backup-once.sh
COPY deploy/backup/backup-loop.sh /usr/local/bin/backup-loop.sh
RUN chmod +x /usr/local/bin/backup-once.sh /usr/local/bin/backup-loop.sh

ENV BACKUP_DIR=/backups
ENV BACKUP_KEEP=30
ENV BACKUP_INTERVAL_SEC=86400
ENV SECRETS_DIR=/run/secrets

CMD ["/usr/local/bin/backup-loop.sh"]

