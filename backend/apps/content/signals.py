from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender="layers.Dataset")
def ensure_feature_layer_item(sender, instance, created, **kwargs):
    """Every Dataset becomes a hosted Feature Layer Item (docs 14.9/14.10)."""
    from .models import Item

    Item.objects.get_or_create(
        dataset=instance,
        defaults={
            "item_type": "feature_layer",
            "title": instance.name,
            "company": instance.company,
            "hosted": True,
            "owner": instance.created_by,
        },
    )


@receiver(post_save, sender="projects.Map")
def ensure_web_map_item(sender, instance, created, **kwargs):
    """Every saved Map becomes a Web Map Item (Save / Save As)."""
    from .models import Item

    Item.objects.get_or_create(
        map=instance,
        defaults={
            "item_type": "web_map",
            "title": instance.name,
            "company": instance.project.company,
            "hosted": True,
            "owner": instance.created_by,
        },
    )